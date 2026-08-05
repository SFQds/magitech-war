import { defineConfig, type Plugin } from 'vite';
import { WebSocketServer } from 'ws';

// 局域网联机 Vite 插件: 在 dev server 同进程挂载 WebSocket 中继服务 (/lan 路径)
// 2 个槽位 (host + client), 在两者间转发消息。浏览器端用原生 WebSocket 连接。
// 注: Vite 5.4.21 在此环境下 server.configureServer 配置项钩子不触发,
//     但插件级 configureServer 钩子正常触发, 故用插件方式挂载。
function lanRelayPlugin(): Plugin {
  return {
    name: 'lan-relay',
    configureServer(server) {
      const httpServer = server.httpServer;
      if (!httpServer) {
        console.error('[LAN] httpServer 不可用, 无法挂载 WebSocket');
        return;
      }
      // noServer 模式: 不通过 { server, path } 挂载, 避免 ws 库在 path 不匹配时
      // abortHandshake(400) 误伤 Vite 自带的 HMR websocket (根路径 /?token=...),
      // 否则会触发 "[vite] server connection lost" 无限重连循环导致整页卡死。
      // 只在 upgrade 事件里精确匹配 /lan 才接管, 其余交给 Vite 自己的监听器。
      const wss = new WebSocketServer({ noServer: true });
      httpServer.on('upgrade', (req, socket, head) => {
        const url = req.url || '/';
        const pathname = url.split('?')[0];
        if (pathname !== '/lan') return; // 非 /lan 放行给其它 upgrade 监听器(Vite HMR)
        wss.handleUpgrade(req, socket, head, (ws) => {
          wss.emit('connection', ws, req);
        });
      });
      const slots: { host: any; client: any } = { host: null, client: null };

      wss.on('connection', (ws: any) => {
        ws.on('message', (raw: Buffer) => {
          try {
            const msg = JSON.parse(String(raw));
            // hello 消息: 按 role 分配槽位
            if (msg.t === 'hello') {
              if (msg.role === 'host') {
                // 槽位冲突时接管: Lobby→Game 切换会秒断旧连接再立刻重连,
                // 关闭旧 socket 的 close 事件可能晚于新 hello 到达 (异步), 直接拒绝会把
                // 无重连机制的主机 session 永久卡死。改为顶掉旧槽并采用新连接 (兼作重连)。
                if (slots.host && slots.host !== ws && slots.host.readyState === 1) {
                  slots.host.close(4001, 'replaced by new host connection');
                }
                slots.host = ws;
                ws.__role = 'host';
                console.log('[LAN] 主机已连入');
              } else if (msg.role === 'client' && !slots.client) {
                slots.client = ws;
                ws.__role = 'client';
                console.log('[LAN] 客户端已连入');
                // 通知主机: 客户端到了
                if (slots.host && slots.host.readyState === 1) {
                  slots.host.send(JSON.stringify({ t: 'client_joined', name: msg.name }));
                }
              } else {
                ws.close(4000, 'slot full or invalid role');
                return;
              }
              return;
            }
            // 其他消息: 转发给对方
            const peer = ws.__role === 'host' ? slots.client : ws.__role === 'client' ? slots.host : null;
            if (peer && peer.readyState === 1) {
              peer.send(String(raw));
            }
          } catch { /* ignore malformed */ }
        });

        ws.on('close', () => {
          if (ws.__role === 'host') { slots.host = null; console.log('[LAN] 主机断开'); }
          else if (ws.__role === 'client') { slots.client = null; console.log('[LAN] 客户端断开'); }
          // 通知对方
          const peer = ws.__role === 'host' ? slots.client : ws.__role === 'client' ? slots.host : null;
          if (peer && peer.readyState === 1) {
            peer.send(JSON.stringify({ t: 'peer_disconnect' }));
          }
        });

        ws.on('error', () => {});
      });

      console.log('[LAN] WebSocket 中继服务已挂载: ws://<本机IP>:3000/lan (2 槽位: host+client)');
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [lanRelayPlugin()],
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    rollupOptions: {
      output: {
        // 分包: phaser 体积大且稳定(极少变动), 单独成 chunk 以命中浏览器长期缓存;
        // 游戏逻辑代码迭代时只需重新下载较小的 index chunk。
        manualChunks: {
          phaser: ['phaser'],
        },
      },
    },
  },
  server: {
    port: 3000,
    open: true,
  },
});

// server.js - WebSocket 服务器（用于 WebRTC 信令交换）
const WebSocket = require('ws');
const wss = new WebSocket.Server({ port: process.env.PORT || 8080 });

const rooms = new Map(); // 存储房间和对应的客户端

wss.on('connection', (ws) => {
  console.log('新的客户端连接');

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      console.log('收到消息:', data.type);

      switch (data.type) {
        case 'create':
          handleCreateRoom(ws, data.roomId);
          break;
        case 'join':
          handleJoinRoom(ws, data.roomId);
          break;
        case 'signal':
          handleSignal(ws, data.roomId, data.data);
          break;
      }
    } catch (e) {
      console.error('解析消息出错:', e);
    }
  });

  ws.on('close', () => {
    console.log('客户端断开连接');
    // 清理断开的客户端
    rooms.forEach((clients, roomId) => {
      if (clients.has(ws)) {
        clients.delete(ws);
        if (clients.size === 0) {
          rooms.delete(roomId);
          console.log(`房间 ${roomId} 已被移除`);
        }
      }
    });
  });
});

// 创建房间
function handleCreateRoom(ws, roomId) {
  if (rooms.has(roomId)) {
    ws.send(JSON.stringify({ type: 'error', message: '房间已存在' }));
    return;
  }

  const clients = new Set([ws]);
  rooms.set(roomId, clients);
  console.log(`房间 ${roomId} 已创建`);
  ws.send(JSON.stringify({ type: 'roomCreated', roomId }));
}

// 加入房间
function handleJoinRoom(ws, roomId) {
  const clients = rooms.get(roomId);
  if (!clients) {
    ws.send(JSON.stringify({ type: 'error', message: '房间不存在' }));
    return;
  }

  if (clients.size >= 2) {
    ws.send(JSON.stringify({ type: 'error', message: '房间已满' }));
    return;
  }

  clients.add(ws);
  console.log(`客户端已加入房间 ${roomId}`);
  ws.send(JSON.stringify({ type: 'roomJoined', roomId }));

  // 通知房间内其他玩家有新玩家加入
  clients.forEach(client => {
    if (client !== ws && client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({ type: 'peerJoined' }));
    }
  });
}

// 转发 WebRTC 信令数据
function handleSignal(ws, roomId, signalData) {
  const clients = rooms.get(roomId);
  if (!clients) return;

  console.log(`转发信号数据到房间 ${roomId}`);
  clients.forEach(client => {
    if (client !== ws && client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({ type: 'signal', data: signalData }));
    }
  });
}

console.log('WebSocket 服务器已启动，端口:', process.env.PORT || 8080);

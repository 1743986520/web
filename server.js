// server.js - WebSocket对战服务器
const WebSocket = require('ws');
const wss = new WebSocket.Server({ port: process.env.PORT || 8080 });

// 房间存储结构: { [roomId]: { host: WebSocket, guest: WebSocket, hostRole: string, guestRole: string } }
const rooms = new Map();

// 聊天服务器列表
const chatServers = [
  "https://chat-server-1-rhl5.onrender.com",
  "https://chat-server-2-rxjx.onrender.com",
  "https://chat-server-3-whxs.onrender.com",
  "https://chat-server-4-qdax.onrender.com",
  "https://chat-server-5-midt.onrender.com"
];

// 启动聊天服务器心跳检测
setInterval(() => {
  chatServers.forEach(server => {
    fetch(`${server}/ping`)
      .then(res => {
        if (!res.ok) console.error(`${server} 心跳失败`);
      })
      .catch(err => console.error(`${server} 不可用`, err));
  });
}, 5 * 60 * 1000); // 每5分钟检测一次

wss.on('connection', (ws) => {
  console.log('新的客户端连接');
  
  let currentRoom = null;
  
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      console.log('收到消息:', data);
      
      // 1. 创建房间
      if (data.type === 'create') {
        if (rooms.has(data.roomId)) {
          ws.send(JSON.stringify({ 
            type: 'error', 
            message: '房间已存在' 
          }));
          return;
        }
        
        rooms.set(data.roomId, { 
          host: ws, 
          guest: null,
          hostRole: 'X',
          guestRole: 'O'
        });
        
        currentRoom = data.roomId;
        
        ws.send(JSON.stringify({ 
          type: 'room_created', 
          roomId: data.roomId 
        }));
      }
      
      // 2. 加入房间
      else if (data.type === 'join') {
        const room = rooms.get(data.roomId);
        
        if (!room) {
          ws.send(JSON.stringify({ 
            type: 'error', 
            message: '房间不存在' 
          }));
          return;
        }
        
        if (room.guest) {
          ws.send(JSON.stringify({ 
            type: 'error', 
            message: '房间已满' 
          }));
          return;
        }
        
        room.guest = ws;
        currentRoom = data.roomId;
        
        // 通知加入者
        ws.send(JSON.stringify({ 
          type: 'room_joined',
          role: room.guestRole
        }));
        
        // 通知主机
        room.host.send(JSON.stringify({ 
          type: 'player_joined',
          role: room.hostRole
        }));
      }
      
      // 3. 游戏动作
      else if (data.type === 'move' && currentRoom) {
        const room = rooms.get(currentRoom);
        if (!room) return;
        
        const target = ws === room.host ? room.guest : room.host;
        if (target && target.readyState === WebSocket.OPEN) {
          target.send(JSON.stringify({
            type: 'move',
            pos: data.pos,
            player: data.player
          }));
        }
      }
      
      // 4. 重置游戏
      else if (data.type === 'reset' && currentRoom) {
        const room = rooms.get(currentRoom);
        if (!room) return;
        
        const target = ws === room.host ? room.guest : room.host;
        if (target && target.readyState === WebSocket.OPEN) {
          target.send(JSON.stringify({
            type: 'reset'
          }));
        }
      }
      
      // 5. 聊天消息
      else if (data.type === 'chat' && currentRoom) {
        const room = rooms.get(currentRoom);
        if (!room) return;
        
        // 广播给房间内所有玩家
        [room.host, room.guest].forEach(client => {
          if (client && client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({
              type: 'chat',
              sender: data.sender,
              message: data.message
            }));
          }
        });
      }
      
    } catch (e) {
      console.error('消息处理错误:', e);
    }
  });
  
  ws.on('close', () => {
    console.log('客户端断开连接');
    if (currentRoom) {
      const room = rooms.get(currentRoom);
      if (room) {
        // 清理房间
        if (ws === room.host) {
          if (room.guest) {
            room.guest.send(JSON.stringify({
              type: 'error',
              message: '对方已断开连接'
            }));
          }
          rooms.delete(currentRoom);
        } else if (ws === room.guest) {
          room.guest = null;
          room.host.send(JSON.stringify({
            type: 'error',
            message: '对方已断开连接'
          }));
        }
      }
    }
  });
  
  ws.on('error', (err) => {
    console.error('WebSocket错误:', err);
  });
});

console.log('对战服务器已启动，端口:', process.env.PORT || 8080);
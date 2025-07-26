const WebSocket = require('ws');
const wss = new WebSocket.Server({ port: process.env.PORT || 8080 });

// 房间存储结构: { [roomId]: { host: WebSocket, guest: WebSocket } }
const rooms = new Map();

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
        
        // 通知双方玩家
        ws.send(JSON.stringify({ 
          type: 'room_joined', 
          roomId: data.roomId 
        }));
        
        room.host.send(JSON.stringify({ 
          type: 'player_joined' 
        }));
        
        // 发送角色信息
        ws.send(JSON.stringify({ 
          type: 'role', 
          role: room.guestRole 
        }));
        
        // 通知主机发送角色
        room.host.send(JSON.stringify({ 
          type: 'role', 
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
            pos: data.pos
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

console.log('信令服务器已启动，端口:', process.env.PORT || 8080);
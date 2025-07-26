const WebSocket = require('ws');
const wss = new WebSocket.Server({ port: process.env.PORT || 8080 });

const rooms = new Map(); // 房间ID到客户端集合的映射

wss.on('connection', (ws) => {
  console.log('新的客户端连接');
  
  let currentRoom = null;

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      console.log('收到消息:', data.type);
      
      switch (data.type) {
        case 'create':
          if (rooms.has(data.roomId)) {
            ws.send(JSON.stringify({ 
              type: 'error', 
              message: '房间已存在' 
            }));
            return;
          }
          
          rooms.set(data.roomId, [ws]);
          currentRoom = data.roomId;
          ws.send(JSON.stringify({ 
            type: 'roomCreated', 
            roomId: data.roomId 
          }));
          break;
          
        case 'join':
          const room = rooms.get(data.roomId);
          if (!room) {
            ws.send(JSON.stringify({ 
              type: 'error', 
              message: '房间不存在' 
            }));
            return;
          }
          
          if (room.length >= 2) {
            ws.send(JSON.stringify({ 
              type: 'error', 
              message: '房间已满' 
            }));
            return;
          }
          
          room.push(ws);
          currentRoom = data.roomId;
          ws.send(JSON.stringify({ 
            type: 'roomJoined', 
            roomId: data.roomId 
          }));
          
          // 通知房间内所有客户端有新人加入
          room.forEach(client => {
            client.send(JSON.stringify({ 
              type: 'peerJoined' 
            }));
          });
          break;
          
        case 'action':
          if (currentRoom) {
            const roomClients = rooms.get(currentRoom);
            if (roomClients) {
              roomClients.forEach(client => {
                if (client !== ws && client.readyState === WebSocket.OPEN) {
                  client.send(JSON.stringify({
                    type: 'action',
                    code: data.code
                  }));
                }
              });
            }
          }
          break;
          
        default:
          console.warn('未知消息类型:', data.type);
      }
    } catch (e) {
      console.error('解析消息出错:', e);
    }
  });

  ws.on('close', () => {
    console.log('客户端断开连接');
    if (currentRoom) {
      const room = rooms.get(currentRoom);
      if (room) {
        const index = room.indexOf(ws);
        if (index !== -1) {
          room.splice(index, 1);
          
          // 通知剩余玩家有玩家离开
          room.forEach(client => {
            client.send(JSON.stringify({ 
              type: 'peerDisconnected' 
            }));
          });
          
          if (room.length === 0) {
            rooms.delete(currentRoom);
          }
        }
      }
    }
  });
  
  ws.on('error', (err) => {
    console.error('WebSocket错误:', err);
  });
});

console.log('WebSocket 服务器已启动，端口:', process.env.PORT || 8080);
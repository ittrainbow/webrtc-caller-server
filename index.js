const path = require('path')
const express = require('express')
const app = express()
const server = require('http').createServer(app)
const io = require('socket.io')(server)
const { version, validate } = require('uuid')

const PORT = process.env.PORT || 5001

function getClientRooms() {
  const { rooms } = io.sockets.adapter

  return Array.from(rooms.keys()).filter((room) => validate(room) && version(room) === 4)
}

function shareRoomsInfo() {
  io.emit('SHARE_ROOMS', {
    rooms: getClientRooms()
  })
}

io.on('connection', (socket) => {
  shareRoomsInfo()

  socket.on('JOIN_ROOM', (config) => {
    const { room } = config
    const { rooms } = socket

    console.log('JOIN_ROOM', room)

    if (Array.from(rooms).includes(room)) {
      return console.warn(`Already joined to ${room}`)
    }

    const clients = Array.from(io.sockets.adapter.rooms.get(room) || [])

    clients.forEach((clientID) => {
      io.to(clientID).emit('ADD_PEER', {
        peer: socket.id,
        shouldCreateOffer: false
      })

      socket.emit('ADD_PEER', {
        peer: clientID,
        shouldCreateOffer: true
      })
    })

    socket.join(room)
    shareRoomsInfo()
  })

  const leaveRoom = () => {
    const { rooms } = socket

    Array.from(rooms)
      .filter((room) => validate(room) && version(room) === 4)
      .forEach((room) => {
        const clients = Array.from(io.sockets.adapter.rooms.get(room) || [])

        clients.forEach((clientID) => {
          io.to(clientID).emit('REMOVE_PEER', { peer: socket.id })
          socket.emit('REMOVE_PEER', { peer: clientID })
        })

        socket.leave(room)
      })

    shareRoomsInfo()
  }

  const sendSessionDescription = ({ peer, sessionDescription }) => {
    io.to(peer).emit('SESSION_DESCRIPTION', {
      peer: socket.id,
      sessionDescription
    })
  }

  const sendIceCandidate = ({ peer, iceCandidate }) => {
    io.to(peer).emit('ICE_CANDIDATE', {
      peer: socket.id,
      iceCandidate
    })
  }

  socket.on('LEAVE_ROOM', leaveRoom)
  socket.on('disconnecting', leaveRoom)
  socket.on('RELAY_SDP', sendSessionDescription)
  socket.on('RELAY_ICE', sendIceCandidate)
})

const publicPath = path.join(__dirname, 'build')

app.use(express.static(publicPath))

app.get('*', (req, res) => {
  res.sendFile(path.join(publicPath, 'index.html'))
})

server.listen(PORT, () => {
  console.log(`Server started on port ${PORT}`)
})

const path = require('path')
const express = require('express')
const app = express()
const server = require('http').createServer(app)
const io = require('socket.io')(server)
const { version, validate } = require('uuid')

const PORT = process.env.PORT || 5001

function getClientRooms() {
  const { rooms } = io.sockets.adapter

  return Array.from(rooms.keys()).filter((roomID) => validate(roomID) && version(roomID) === 4)
}

function shareRoomsInfo() {
  io.emit('SHARE_ROOMS', {
    rooms: getClientRooms()
  })
}

io.on('connection', (socket) => {
  shareRoomsInfo()

  socket.on('JOIN_ROOM', (config) => {
    const { roomID } = config
    const { rooms } = socket

    if (Array.from(rooms).includes(roomID)) {
      return console.warn(`Already joined to ${roomID}`)
    }

    const clients = Array.from(io.sockets.adapter.rooms.get(roomID) || [])

    clients.forEach((clientID) => {
      io.to(clientID).emit('ADD_PEER', {
        peerID: socket.id,
        shouldCreateOffer: false
      })

      socket.emit('ADD_PEER', {
        peerID: clientID,
        shouldCreateOffer: true
      })
    })

    socket.join(roomID)
    shareRoomsInfo()
  })

  const leaveRoom = () => {
    const { rooms } = socket

    Array.from(rooms)
      .filter((roomID) => validate(roomID) && version(roomID) === 4)
      .forEach((roomID) => {
        const clients = Array.from(io.sockets.adapter.rooms.get(roomID) || [])

        clients.forEach((clientID) => {
          io.to(clientID).emit('REMOVE_PEER', { peerID: socket.id })
          socket.emit('REMOVE_PEER', { peerID: clientID })
        })

        socket.leave(roomID)
      })

    shareRoomsInfo()
  }

  const sendSessionDescription = ({ peerID, sessionDescription }) => {
    io.to(peerID).emit('SESSION_DESCRIPTION', {
      peerID: socket.id,
      sessionDescription
    })
  }

  const sendIceCandidate = ({ peerID, iceCandidate }) => {
    io.to(peerID).emit('ICE_CANDIDATE', {
      peerID: socket.id,
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

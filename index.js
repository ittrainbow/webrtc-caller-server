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
  io.emit('share_rooms', {
    rooms: getClientRooms()
  })
}

io.on('connection', (socket) => {
  shareRoomsInfo()

  socket.on('join_room', (config) => {
    const { room } = config
    const { rooms } = socket

    if (Array.from(rooms).includes(room)) {
      return console.warn(`Already joined to ${room}`)
    }

    const clients = Array.from(io.sockets.adapter.rooms.get(room) || [])

    clients.forEach((client) => {
      io.to(client).emit('add_peer', {
        peer: socket.id,
        shouldCreateOffer: false
      })

      socket.emit('add_peer', {
        peer: client,
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

        clients.forEach((client) => {
          io.to(client).emit('remove_peer', { peer: socket.id })
          socket.emit('remove_peer', { peer: client })
        })

        socket.leave(room)
      })

    shareRoomsInfo()
  }

  const sendSessionDescription = ({ peer, sessionDescription }) => {
    io.to(peer).emit('emit_sdp', {
      peer: socket.id,
      sessionDescription
    })
  }

  const sendIceCandidate = ({ peer, iceCandidate }) => {
    io.to(peer).emit('emit_ice', {
      peer: socket.id,
      iceCandidate
    })
  }

  socket.on('leave_room', leaveRoom)
  socket.on('disconnecting', leaveRoom)
  socket.on('transmit_sdp', sendSessionDescription)
  socket.on('transmit_ice', sendIceCandidate)
})

server.listen(PORT, () => {
  console.log(`Server started on port ${PORT}`)
})

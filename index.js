const express = require('express')
const http = require('http')
const socket = require('socket.io')
const { version, validate } = require('uuid')

const app = express()
const server = http.createServer(app)
const io = socket(server)

const PORT = process.env.PORT || 5001

const validateRoomID = (roomID) => validate(roomID) && version(roomID) === 4

const getRooms = () => {
  // get rooms list
  const { rooms } = io.sockets.adapter

  // get uuid created rooms only cause we do not need auto-created rooms while they're present by default
  const filteredRooms = Array.from(rooms.keys()).filter((roomID) => validateRoomID(roomID))
  return filteredRooms
}

const shareRooms = () => {
  // emit rooms list to socket-connected peers
  io.emit('SHARE_ROOMS', {
    rooms: getRooms()
  })
}

io.on('connection', (socket) => {
  shareRooms()
  console.log('Socket connected')

  const leaveRoom = () => {
    const { rooms } = socket
    Array.from(rooms).forEach((roomID) => {
      // get all peers connected to this room or empty array if noone
      const clients = Array.from(io.sockets.adapter.rooms.get(roomID) || [])

      clients.forEach((client) => {
        // tell every peer in room to disconnect from leaving peer
        io.to(client).emit('REMOVE_PEER', {
          peerID: socket.id
        })

        // tell leaving peer every client's id to disconnect from
        socket.emit('REMOVE_PEER', {
          peerID: client
        })
      })

      console.log(`peer ${socket.id} leaving room ${roomID}`)
      socket.leave(roomID)
      shareRooms()
    })
  }

  const joinRoom = (data) => {
    {
      const { roomID } = data
      const { rooms } = socket

      if (Array.from(rooms).includes(roomID)) {
        return console.error('already connected to room')
      }

      // get all peers connected to this room or empty array if noone
      const clients = Array.from(io.sockets.adapter.rooms.get(roomID) | [])

      clients.forEach((clientID) => {
        // tell every peer in room to add new joining peer, no offer created
        io.to(clientID).emit('ADD_PEER', {
          peerID: socket.id,
          shouldCreateOffer: false
        })

        // tell joining peer to add every other client id and create an offer
        socket.emit('ADD_PEER', {
          peerID: clientID,
          shouldCreateOffer: true
        })
      })

      console.log(`peer ${socket.id} joined room ${roomID}`)
      socket.join(roomID)
      shareRooms()
    }
  }

  const sessionDescription = ({ peerID, sessionDescription }) => {
    // send from current peer
    io.to(peerID).emit('SESSION_DESCIPTION', {
      peerID: socket.id,
      sessionDescription
    })
  }

  const iceCandidate = ({ peerID, iceCandidate }) => {
    // send from current peer
    io.to(peerID).emit('ICE_CANDIDATE', {
      peerID: socket.id,
      iceCandidate
    })
  }

  socket.on('JOIN_ROOM', joinRoom)
  socket.on('LEAVE_ROOM', (socket) => leaveRoom(socket))
  socket.on('disconnecting', (socket) => leaveRoom(socket))
  socket.on('RELAY_LOCALDESC', sessionDescription)
  socket.on('RELAY_ICECANDIDATE', iceCandidate)
})

server.listen(PORT, () => console.log(`Server is running at ${PORT}`))

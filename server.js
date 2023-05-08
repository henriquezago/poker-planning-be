const { Server } = require('socket.io');
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');

const API_PORT = 3001;

// Setting up the server
const app = express();
app.use(cors({
  origin: '*'
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// DB config
mongoose.connect('mongodb://localhost/poker')
  .then(() => {
    console.log('MongoDB connected');
  })
  .catch((err) => {
    console.log('MongoDB connection error:', err);
  });

const { Schema } = mongoose;

const participantSchema = new Schema({
  name: String,
  estimate: Number,
});

const sessionSchema = new Schema({
  _id: Schema.Types.ObjectId,
  name: String,
  participants: [participantSchema],
  finalEstimate: Number,
});

const Session = mongoose.model('Session', sessionSchema);
const Participant = mongoose.model('Participant', participantSchema);

// Socket.io
const io = new Server(7071, {
  cors: {
    origin: '*',
  }
});

io.on('connection', (socket) => {
  socket.on('update-estimate', async (data) => {
    const { sessionId, participantId, estimate } = data;
    const session = await Session.findById(sessionId);

    if (session) {
      await Session.updateOne(
        { _id: sessionId, "participants._id": participantId },
        { $set: { "participants.$.estimate": estimate } },
      );
      const updatedSession = await Session.findById(sessionId);
      socket.emit('session-updated-' + sessionId, updatedSession);
      socket.broadcast.emit('session-updated-' + sessionId, updatedSession);
    }
  });
});

// API routes
app.get('/session', async (req, res) => {
  const sessionId = req.query.sessionId;
  const session = await Session.findById(sessionId);

  if (!session) {
    res.status(404).send('Session not found');
    return;
  }

  res.send(session);
});

app.post('/create-session', async (req, res) => {
  const { sessionName, participantName } = req.body;

  const newSession = new Session({
    name: sessionName,
    participants: [
      {
        name: participantName,
        estimate: null,
      }
    ],
  });

  await newSession.save();
  res.send(newSession);
});

app.post('/participate-in-session', async (req, res) => {
  const { sessionId, participantName } = req.body;

  const session = await Session.findById(sessionId);
  if (session) {
    const newParticipant = new Participant({
      name: participantName,
      estimate: null,
    });

    session.participants.push(newParticipant);
    await session.save();
    res.send(newParticipant);
  } else {
    res.status(404).send('Session not found');
  }
});

app.post('/finalize-estimate', async (req, res) => {
  const { sessionId, participantId, estimate } = req.body;
  await Session.findOneAndUpdate({ "participants._id": participantId }, { estimate: estimate });

  // Finish this with emitting through socket.io
});

app.listen(API_PORT, () => {
  console.log('listening on port', API_PORT);
});

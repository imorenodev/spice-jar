// netlify/functions/game-api.js

const fetch = require('node-fetch');

exports.handler = async (event, context) => {
  // 1. GET SECRETS FROM ENVIRONMENT
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_KEY;

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return { statusCode: 500, body: "Missing Environment Variables" };
  }

  // Helper to call Supabase REST API
  const dbRequest = async (method, table, query = '', body = null) => {
    const url = `${SUPABASE_URL}/rest/v1/${table}${query}`;
    const options = {
      method: method,
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation' // Ask Supabase to return the created/updated object
      }
    };
    if (body) options.body = JSON.stringify(body);
    
    const response = await fetch(url, options);
    const data = await response.json();
    return { status: response.status, data };
  };

  try {
    const { action, roomCode, username, choices, slot } = JSON.parse(event.body || '{}');

    // --- ACTION: JOIN / CREATE ROOM ---
    if (action === 'join') {
      // Check if room exists
      let { data: rooms } = await dbRequest('GET', 'rooms', `?room_code=eq.${roomCode}&select=*`);
      let room = rooms[0];

      if (!room) {
        // Create new room
        const { data: newRoom } = await dbRequest('POST', 'rooms', '', {
          room_code: roomCode,
          user1_name: username,
          status: 'waiting'
        });
        return { statusCode: 200, body: JSON.stringify({ slot: 'user1', room: newRoom[0] }) };
      }

      // Join existing
      if (room.user1_name === username) return { statusCode: 200, body: JSON.stringify({ slot: 'user1', room }) };
      if (room.user2_name === username) return { statusCode: 200, body: JSON.stringify({ slot: 'user2', room }) };
      
      if (!room.user2_name) {
        // Take slot 2
        const { data: updated } = await dbRequest('PATCH', 'rooms', `?room_code=eq.${roomCode}`, { user2_name: username });
        return { statusCode: 200, body: JSON.stringify({ slot: 'user2', room: updated[0] }) };
      }

      return { statusCode: 400, body: JSON.stringify({ error: "Room Full" }) };
    }

    // --- ACTION: POLL STATUS ---
    if (action === 'status') {
      let { data: rooms } = await dbRequest('GET', 'rooms', `?room_code=eq.${roomCode}&select=*`);
      return { statusCode: 200, body: JSON.stringify(rooms[0]) };
    }

    // --- ACTION: SUBMIT CHOICES ---
    if (action === 'submit') {
      const payload = {};
      if (slot === 'user1') payload.user1_choices = choices;
      else payload.user2_choices = choices;

      await dbRequest('PATCH', 'rooms', `?room_code=eq.${roomCode}`, payload);
      return { statusCode: 200, body: JSON.stringify({ success: true }) };
    }
    
    // --- ACTION: RESET ---
    if (action === 'reset') {
       await dbRequest('PATCH', 'rooms', `?room_code=eq.${roomCode}`, {
         user1_choices: [], user2_choices: [], status: 'waiting'
       });
       return { statusCode: 200, body: JSON.stringify({ success: true }) };
    }

    return { statusCode: 400, body: "Invalid Action" };

  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};
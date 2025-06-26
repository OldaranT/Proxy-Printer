const express = require('express');
const fetch = require('node-fetch');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors()); // allow all origins

// Proxy endpoint
app.get('/api/deck/:id', async (req, res) => {
  const deckId = req.params.id;
  const archidektUrl = `https://archidekt.com/api/decks/${deckId}/small/`;

  try {
    const response = await fetch(archidektUrl);
    const data = await response.json();
    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch Archidekt deck.' });
  }
});

app.listen(PORT, () => {
  console.log(`Archidekt proxy running on port ${PORT}`);
});
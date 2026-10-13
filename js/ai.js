const AIService = {
  /**
   * Parse voice intent using Groq API
   * @param {string} transcript The voice input text
   * @returns {Promise<Object>} JSON containing intent details
   */
  async parseVoiceIntent(transcript) {
    
    const prompt = `
You are an intelligent music assistant inside a web music player app.
Analyze the user's voice transcript and extract their intent.
The transcript is: "${transcript}"

Return ONLY a raw JSON object with no markdown formatting or extra text.
The JSON should follow this structure:
{
  "type": "search" | "playlist",
  "query": "the extracted search term or playlist theme",
  "playImmediate": boolean // true if they said "play X", false if just "find X" or "search X"
}
Examples:
- "Play some upbeat synthwave" -> {"type": "playlist", "query": "upbeat synthwave", "playImmediate": true}
- "Search for Blinding Lights by The Weeknd" -> {"type": "search", "query": "Blinding Lights The Weeknd", "playImmediate": false}
- "Play latest songs of Taylor Swift" -> {"type": "search", "query": "latest songs of Taylor Swift", "playImmediate": true}
`;

    return this._callGroq(prompt);
  },

  /**
   * Generate a playlist of 5-10 songs based on a prompt
   * @param {string} prompt User's playlist prompt
   * @returns {Promise<Object>} JSON containing an array of song queries
   */
  async generatePlaylistFromPrompt(prompt) {

    const sysPrompt = `
You are an expert music curator. 
The user wants a playlist based on this prompt: "${prompt}"

Generate a list of exactly 8 real, popular songs that perfectly match this vibe or theme.
Return ONLY a raw JSON object with no markdown formatting.
Format:
{
  "title": "A creative title for this playlist (e.g. 'Rainy Day Jazz')",
  "description": "A short, engaging description for this playlist.",
  "songs": [
    "Song Name - Artist Name",
    "Another Song - Artist"
  ]
}
`;

    return this._callGroq(sysPrompt);
  },

  async _callGroq(prompt) {
    const url = `/api/groq/openai/v1/chat/completions`;
    
    try {
      const headers = { 'Content-Type': 'application/json' };
      try {
        const firebaseIdToken = await window.AuthManager?.getFirebaseIdToken?.();
        if (firebaseIdToken) headers.Authorization = `Bearer ${firebaseIdToken}`;
      } catch (authError) {
        console.warn('Could not refresh Firebase sign-in for AI request:', authError.message);
      }
      const response = await fetch(url, {
        method: 'POST',
        credentials: 'same-origin',
        headers,
        body: JSON.stringify({
          messages: [{ role: "user", content: prompt }],
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("Groq API Error:", errorText);
        let detail = "Please try again later.";
        try {
          const errObj = JSON.parse(errorText);
          if (typeof errObj.error === 'string') {
            detail = errObj.error;
          } else if (errObj.error && errObj.error.message) {
            detail = errObj.error.message;
          }
        } catch(e) {}
        throw new Error("AI Error: " + detail);
      }

      const data = await response.json();
      const rawText = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
      if (typeof rawText !== 'string') throw new Error('The AI service returned an unexpected response.');
      
      // Sometimes models might still include markdown blocks despite instructions, so we clean it.
      const cleanedText = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
      
      const result = JSON.parse(cleanedText);
      if (!result || typeof result !== 'object' || Array.isArray(result)) {
        throw new Error('The AI service returned invalid structured data.');
      }
      return result;
    } catch (err) {
      console.error(err);
      throw err;
    }
  }
};

window.AIService = AIService;

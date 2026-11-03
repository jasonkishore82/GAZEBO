// The tools Greeny can call during a voice chat (Gemini function calling).
// The server sends these declarations to Gemini when a chat starts; the
// browser runs the calls (see src/tools.js). To add a tool: declare it here
// and add a handler with the same name in src/tools.js.
export const TOOL_DECLARATIONS = [
  {
    name: 'list_users',
    description:
      'Look up everyone registered with a saved face or voice, who is on camera right now, who is speaking, ' +
      'whether you are awake or asleep, and the current wake rule. Call this before making decisions about specific people.',
    parameters: { type: 'OBJECT', properties: {} },
  },
  {
    name: 'set_wake_policy',
    description:
      'Choose who is allowed to wake you up. Use it when someone says things like "don\'t wake up until I come back" ' +
      'or "only wake up for me or Sam". Anyone not allowed (strangers, other people) will not wake you, even if they stand in front of the camera. ' +
      'By default you go to sleep right away.',
    parameters: {
      type: 'OBJECT',
      properties: {
        wake_for: {
          type: 'ARRAY',
          items: { type: 'STRING' },
          description: 'Names of registered users who may wake you. Use the real name of the speaker when they say "me" or "I".',
        },
        any_registered: {
          type: 'BOOLEAN',
          description: 'True if any registered user (anyone with a saved face) may wake you, but not strangers.',
        },
        sleep_now: {
          type: 'BOOLEAN',
          description: 'Go to sleep immediately (default true). Set false to only apply the rule when you next fall asleep.',
        },
      },
    },
  },
  {
    name: 'clear_wake_policy',
    description: 'Remove any wake rule so that anyone showing their face wakes you again.',
    parameters: { type: 'OBJECT', properties: {} },
  },
  {
    name: 'go_to_sleep',
    description: 'Go to sleep now. You wake up the next time someone arrives in front of the camera (after the current person has left).',
    parameters: { type: 'OBJECT', properties: {} },
  },
  {
    name: 'wake_up',
    description: 'Wake up now and drop any wake rule.',
    parameters: { type: 'OBJECT', properties: {} },
  },
  {
    name: 'register_face',
    description:
      'Save the new person standing in front of the camera. Use it when someone says things like "save him as Sam" or "remember her as Priya". ' +
      'It takes a clear photo of the face on camera. Nothing is stored until confirm_pending is called, so afterwards ask the user to confirm the name.',
    parameters: {
      type: 'OBJECT',
      properties: { name: { type: 'STRING', description: 'The name to save this person under.' } },
      required: ['name'],
    },
  },
  {
    name: 'register_voice',
    description:
      'Start recording the voice of the person who is about to talk, to save it under a name ("save his voice too"). ' +
      'It returns immediately: tell the person to keep talking for about 8 seconds, then call finish_voice_recording.',
    parameters: {
      type: 'OBJECT',
      properties: { name: { type: 'STRING', description: 'The name to save this voice under (use the same name as their face).' } },
      required: ['name'],
    },
  },
  {
    name: 'finish_voice_recording',
    description: 'Wait for the voice sample started by register_voice to be complete (up to about 15 seconds), then ask the user to confirm.',
    parameters: { type: 'OBJECT', properties: {} },
  },
  {
    name: 'remove_person',
    description:
      'Delete a registered person\'s saved face, voice, or both ("remove Sam", "forget his voice"). ' +
      'Nothing is deleted until confirm_pending is called, so ask the user to confirm first.',
    parameters: {
      type: 'OBJECT',
      properties: {
        name: { type: 'STRING', description: 'The registered name to remove.' },
        what: { type: 'STRING', description: 'face, voice, or both (default both).' },
      },
      required: ['name'],
    },
  },
  {
    name: 'confirm_pending',
    description:
      'Finish or cancel the pending save or delete. Call it with confirm true only after the user clearly said yes to your confirmation question, ' +
      'or with confirm false if they said no or changed their mind. If they corrected the spelling of the name, pass the corrected name.',
    parameters: {
      type: 'OBJECT',
      properties: {
        confirm: { type: 'BOOLEAN', description: 'True to save/delete, false to cancel.' },
        name: { type: 'STRING', description: 'Corrected name, only when saving and the user changed it.' },
      },
      required: ['confirm'],
    },
  },
  {
    name: 'set_camera',
    description: 'Turn the camera on or off ("turn the camera off", "privacy"). Off means nothing is tracked and the camera light goes out.',
    parameters: {
      type: 'OBJECT',
      properties: { on: { type: 'BOOLEAN', description: 'True to turn the camera on, false to turn it off.' } },
      required: ['on'],
    },
  },
  {
    name: 'remember_fact',
    description:
      'Remember a short fact about a person ("remember I like green tea"). It is saved and you will know it in future chats. ' +
      'Defaults to the person who is speaking.',
    parameters: {
      type: 'OBJECT',
      properties: {
        fact: { type: 'STRING', description: 'The fact, in a short sentence.' },
        person: { type: 'STRING', description: 'Who it is about. Leave out for the current speaker.' },
      },
      required: ['fact'],
    },
  },
  {
    name: 'forget_fact',
    description: 'Forget saved facts that mention a word or phrase ("forget that I like tea"). Defaults to the current speaker.',
    parameters: {
      type: 'OBJECT',
      properties: {
        about: { type: 'STRING', description: 'A word or phrase from the fact to forget.' },
        person: { type: 'STRING', description: 'Whose facts. Leave out for the current speaker.' },
      },
      required: ['about'],
    },
  },
  {
    name: 'list_facts',
    description: 'Read back what you remember about a person ("what do you know about me?"). Defaults to the current speaker.',
    parameters: { type: 'OBJECT', properties: { person: { type: 'STRING', description: 'Whose facts. Leave out for the current speaker.' } } },
  },
  {
    name: 'show_emotion',
    description: 'Show a feeling on your face for a few seconds ("look happy", "act surprised").',
    parameters: {
      type: 'OBJECT',
      properties: {
        emotion: { type: 'STRING', description: 'One of: neutral, happy, curious, surprised, sleepy.' },
        seconds: { type: 'NUMBER', description: 'How long to hold it (default 6, up to 60).' },
      },
      required: ['emotion'],
    },
  },
  {
    name: 'greet_on_arrival',
    description: 'Turn greeting on or off: when a registered person comes back in front of the camera you say hello to them by name.',
    parameters: {
      type: 'OBJECT',
      properties: { enabled: { type: 'BOOLEAN', description: 'True to greet people when they arrive (default), false to stop.' } },
    },
  },
  {
    name: 'set_timer',
    description: 'Start a timer ("remind me in 10 minutes to check the oven"). You will tell the user when it finishes.',
    parameters: {
      type: 'OBJECT',
      properties: {
        minutes: { type: 'NUMBER', description: 'Minutes.' },
        seconds: { type: 'NUMBER', description: 'Seconds.' },
        label: { type: 'STRING', description: 'What the timer is for.' },
      },
    },
  },
  {
    name: 'cancel_timer',
    description: 'Cancel a timer by its label, or all timers if no label is given.',
    parameters: { type: 'OBJECT', properties: { label: { type: 'STRING', description: 'The timer label.' } } },
  },
  {
    name: 'change_colors',
    description: 'Change your eye colour and/or face colour. Accepts colour names (red, blue, pink...) or hex like #ff8800.',
    parameters: {
      type: 'OBJECT',
      properties: {
        eye_color: { type: 'STRING', description: 'New eye (iris) colour.' },
        face_color: { type: 'STRING', description: 'New face and body colour.' },
      },
    },
  },
]

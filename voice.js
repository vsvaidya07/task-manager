// voice.js: the System's spoken voice, using the browser's built-in speech (Web Speech API)
const Voice = (function () {
  const OFF_KEY = "taskManager.voiceOff";

  const synth = typeof window !== "undefined" ? window.speechSynthesis : null;
  const supported = !!(synth && typeof window.SpeechSynthesisUtterance === "function");
  let enabled = true;

  try {
    enabled = localStorage.getItem(OFF_KEY) !== "1";
  } catch (err) {
    // storage unavailable, voice stays on
  }

  // Voices that sound female on common devices, best first
  // (Chrome, Edge, Windows, macOS / iOS, Android)
  const PREFERRED = [
    "Google UK English Female",
    "Microsoft Aria",
    "Microsoft Jenny",
    "Microsoft Zira",
    "Microsoft Libby",
    "Microsoft Sonia",
    "Samantha",
    "Karen",
    "Moira",
    "Tessa",
    "Victoria",
    "Fiona",
    "Serena",
    "Susan",
    "Hazel",
    "Google US English",
  ];

  // Names to avoid when we have to fall back to "any English voice"
  const MALE_NAMES = /david|mark|daniel|alex|fred|guy|george|james|ryan|brian|eric|thomas|oliver|rishi|ravi|andrew|brandon|christopher|davis|steffan|roger|jason|tony|male english/i;

  function pickVoice() {
    const voices = (synth.getVoices() || []).filter(function (v) {
      return /^en/i.test(v.lang);
    });

    for (let i = 0; i < PREFERRED.length; i++) {
      const found = voices.find(function (v) {
        return v.name.indexOf(PREFERRED[i]) !== -1;
      });
      if (found) return { voice: found, known: true };
    }

    const labelled = voices.find(function (v) {
      return /female|woman/i.test(v.name);
    });
    if (labelled) return { voice: labelled, known: true };

    const neutral = voices.find(function (v) {
      return !MALE_NAMES.test(v.name);
    });
    if (neutral) return { voice: neutral, known: false };

    return { voice: voices[0] || null, known: false };
  }

  // Speak a line. { interrupt: true } cuts off whatever is being said right now.
  function say(text, options) {
    if (!supported || !enabled) return;
    try {
      if (options && options.interrupt) synth.cancel();

      const utterance = new window.SpeechSynthesisUtterance(text);
      const choice = pickVoice();
      if (choice.voice) {
        utterance.voice = choice.voice;
        utterance.lang = choice.voice.lang;
      } else {
        utterance.lang = "en-US";
      }
      utterance.rate = 0.95;
      // If we couldn't find a known female voice, raise the pitch to sound lighter
      utterance.pitch = choice.known ? 1.1 : 1.35;
      utterance.volume = 1;
      synth.speak(utterance);
    } catch (err) {
      // never let speech problems break the app
    }
  }

  function setEnabled(value) {
    enabled = !!value;
    if (!enabled && supported) {
      try {
        synth.cancel();
      } catch (err) {
        // ignore
      }
    }
    try {
      localStorage.setItem(OFF_KEY, enabled ? "0" : "1");
    } catch (err) {
      // ignore
    }
  }

  // Some browsers load their voice list lazily, so ask for it early
  if (supported) {
    try {
      synth.getVoices();
    } catch (err) {
      // ignore
    }
  }

  return {
    say: say,
    setEnabled: setEnabled,
    isEnabled: function () {
      return enabled;
    },
    isSupported: function () {
      return supported;
    },
    pickVoice: supported ? pickVoice : function () { return { voice: null, known: false }; },
  };
})();

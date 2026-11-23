export type TaekwondoVoiceCommand = 'joombi_shijak' | 'barro_shore';
export type TaekwondoVoicePhase = 'joombi' | 'shijak' | 'barro' | 'shore' | null;

let activeDelayTimer: ReturnType<typeof setTimeout> | null = null;
let activeCleanupTimer: ReturnType<typeof setTimeout> | null = null;
let activeSequenceId = 0;

export function stopTaekwondoVoice() {
  activeSequenceId += 1;
  if (activeDelayTimer) {
    clearTimeout(activeDelayTimer);
    activeDelayTimer = null;
  }
  if (activeCleanupTimer) {
    clearTimeout(activeCleanupTimer);
    activeCleanupTimer = null;
  }
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    try {
      window.speechSynthesis.cancel();
    } catch {
      // Ignore browser speechSynthesis errors
    }
  }
}

export function speakTaekwondoCommand(
  command: TaekwondoVoiceCommand,
  onPhaseChange?: (phase: TaekwondoVoicePhase) => void,
  onComplete?: () => void
) {
  stopTaekwondoVoice();
  const seqId = activeSequenceId;

  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    onPhaseChange?.(null);
    onComplete?.();
    return;
  }

  const synth = window.speechSynthesis;
  const voices = synth.getVoices();
  const koreanVoice = voices.find((v) => v.lang.toLowerCase().startsWith('ko'));
  const englishVoice =
    voices.find((v) => v.lang.toLowerCase() === 'en-us') ||
    voices.find((v) => v.lang.toLowerCase().startsWith('en'));

  const isJoombiShijak = command === 'joombi_shijak';
  const firstPhase: TaekwondoVoicePhase = isJoombiShijak ? 'joombi' : 'barro';
  const secondPhase: TaekwondoVoicePhase = isJoombiShijak ? 'shijak' : 'shore';

  const firstText = koreanVoice
    ? isJoombiShijak
      ? '준비'
      : '바로'
    : isJoombiShijak
      ? 'Joom bee'
      : 'Bah roh';

  const secondText = koreanVoice
    ? isJoombiShijak
      ? '시작!'
      : '쉬어'
    : isJoombiShijak
      ? 'Shee jak!'
      : 'Shor';

  const pauseBetweenMs = isJoombiShijak ? 1200 : 1000;

  const speakPart = (
    text: string,
    rate: number,
    pitch: number,
    onDone: () => void,
    fallbackMs: number
  ) => {
    let completed = false;
    const finish = () => {
      if (completed || seqId !== activeSequenceId) return;
      completed = true;
      if (activeCleanupTimer) {
        clearTimeout(activeCleanupTimer);
        activeCleanupTimer = null;
      }
      onDone();
    };

    try {
      const utter = new SpeechSynthesisUtterance(text);
      if (koreanVoice) {
        utter.voice = koreanVoice;
        utter.lang = koreanVoice.lang || 'ko-KR';
      } else if (englishVoice) {
        utter.voice = englishVoice;
        utter.lang = englishVoice.lang || 'en-US';
      } else {
        utter.lang = 'en-US';
      }
      utter.rate = rate;
      utter.pitch = pitch;
      utter.volume = 1.0;
      utter.onend = finish;
      utter.onerror = finish;

      synth.speak(utter);
      activeCleanupTimer = setTimeout(finish, fallbackMs);
    } catch {
      finish();
    }
  };

  onPhaseChange?.(firstPhase);

  speakPart(
    firstText,
    0.88,
    0.95,
    () => {
      if (seqId !== activeSequenceId) return;
      activeDelayTimer = setTimeout(() => {
        if (seqId !== activeSequenceId) return;
        onPhaseChange?.(secondPhase);
        speakPart(
          secondText,
          isJoombiShijak ? 1.05 : 0.9,
          isJoombiShijak ? 1.05 : 0.95,
          () => {
            if (seqId === activeSequenceId) {
              onPhaseChange?.(null);
              onComplete?.();
            }
          },
          2200
        );
      }, pauseBetweenMs);
    },
    1800
  );
}

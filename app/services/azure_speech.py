import azure.cognitiveservices.speech as speechsdk
import base64
import os
from app.core.config import settings

def get_speech_config():
    """Initializes and validates Azure Speech Configuration."""
    if not settings.AZURE_SPEECH_KEY or not settings.AZURE_SPEECH_REGION:
        raise ValueError("Azure credentials missing in environment variables.")
        
    speech_config = speechsdk.SpeechConfig(
        subscription=settings.AZURE_SPEECH_KEY, 
        region=settings.AZURE_SPEECH_REGION
    )
    speech_config.speech_synthesis_voice_name = "en-US-AriaNeural"
    return speech_config

async def transcribe_audio_to_text(base64_audio: str) -> str:
    """
    STT: Uses PushAudioInputStream to stream audio from memory directly to Azure.
    """
    try:
        audio_bytes = base64.b64decode(base64_audio)
        
        # 16kHz, 16bit, Mono is the standard format for Azure Speech SDK
        stream_format = speechsdk.audio.AudioStreamFormat(samples_per_second=16000, bits_per_sample=16, channels=1)
        push_stream = speechsdk.audio.PushAudioInputStream(stream_format=stream_format)
        
        # Stream data directly into the buffer
        push_stream.write(audio_bytes)
        push_stream.close()
        
        speech_config = get_speech_config()
        audio_config = speechsdk.audio.AudioConfig(stream=push_stream)
        speech_recognizer = speechsdk.SpeechRecognizer(speech_config=speech_config, audio_config=audio_config)

        # Sync result
        result = speech_recognizer.recognize_once()

        if result.reason == speechsdk.ResultReason.RecognizedSpeech:
            return result.text
        return ""
            
    except Exception as e:
        print(f"🚨 [STT SDK Crash Guard] Azure SDK failed: {str(e)}")
        return ""

async def generate_speech_from_text(text: str) -> str:
    """
    TTS: Converts text to speech using memory-only synthesis.
    """
    try:
        speech_config = get_speech_config()
        speech_synthesizer = speechsdk.SpeechSynthesizer(speech_config=speech_config, audio_config=None)

        result = speech_synthesizer.speak_text_async(text).get()

        if result.reason == speechsdk.ResultReason.SynthesizingAudioCompleted:
            return base64.b64encode(result.audio_data).decode('utf-8')
        return None
    except Exception as e:
        print(f"🚨 [TTS SDK Crash Guard] Azure TTS failed: {str(e)}")
        return None
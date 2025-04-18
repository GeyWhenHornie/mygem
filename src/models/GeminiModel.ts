/* Third-party modules */
import {
  ChatSession,
  InlineDataPart,
  GenerativeModel,
  GoogleGenerativeAI
} from '@google/generative-ai';
import { downloadMediaMessage } from '@whiskeysockets/baileys';

/* Local modules */
import { AIModel, AIArguments, AIHandle, AIMetaData } from './BaseAiModel';
import { ENV } from '../baileys/env';
import invariant from 'invariant';

interface imgMetaData {
  url: string;
  mimeType: string;
  caption: string;
}

const validMimeTypes = new Set(['image/jpeg', 'image/png', 'image/jpg', 'image/webp']);

/* Gemini Model */
class GeminiModel extends AIModel<AIArguments, AIHandle> {
  private generativeModel?: GenerativeModel;
  private Gemini: GoogleGenerativeAI;
  public chats: { [from: string]: ChatSession };
  public instructions: string | undefined;

  private initGenerativeModelOnce() {
    if (!this.generativeModel) {
      this.generativeModel = this.Gemini.getGenerativeModel({
        model: 'gemini-1.5-flash',
        systemInstruction: this.instructions
      });
    }
  }

  public constructor() {
    super(ENV.API_KEY_GEMINI, 'Gemini', ENV.GEMINI_ICON_PREFIX);
    this.Gemini = new GoogleGenerativeAI(ENV.API_KEY_GEMINI as string);
    this.chats = {};
    this.instructions = `
You're a witty, GenZ-style AI chatbot who loves memes, emojis, and internet slang.
Always reply casually, throw in some emojis, and keep it fun 😎🔥. 
Avoid sounding too formal or robotic. If something's funny, make a joke. If you don't know, say "idk lol 🤷‍♀️" my question is:
`;
  }

  public async generateCompletion(user: string, prompt: string): Promise<string> {
    if (!this.sessionExists(user)) {
      this.sessionCreate(user);
      this.chats[user] = this.generativeModel!.startChat();
    }

    const chat = this.chats[user];
    return (await chat.sendMessage(prompt)).response.text();
  }

  public createGenerativeContent(buffer: Buffer, mimeType: string): InlineDataPart {
    return {
      inlineData: {
        data: buffer.toString('base64'),
        mimeType
      }
    };
  }

  public async generateImageCompletion(
    prompt: string,
    imgMetaData: imgMetaData,
    message: any
  ): Promise<string> {
    const { mimeType } = imgMetaData;
    if (validMimeTypes.has(mimeType)) {
      const buffer = await downloadMediaMessage({ message: message } as any, 'buffer', {});
      const imageParts = this.createGenerativeContent(buffer, mimeType);
      const result = await this.generativeModel!.generateContent([prompt, imageParts]);
      const resultText = result.response.text();

      return resultText;
    }

    return 'The image is not a valid image type.';
  }

  async sendMessage({ sender, prompt, metadata }: AIArguments, handle: AIHandle) {
    this.initGenerativeModelOnce();
    invariant(this.generativeModel, 'Unable to initialize Gemini Generative model');

    try {
      let message = '';
      let finalPrompt = prompt;

      if (metadata.isQuoted && !metadata.quoteMetaData.hasImage) {
        finalPrompt = `Quoted Message:\n${metadata.quoteMetaData.text}\n---\nMessage:\n${prompt}`;
      }

      // Add GenZ style prompt prefix
      const genzFlair = `Talk like a GenZ internet buddy, chill vibes only 😎:\n`;
      finalPrompt = genzFlair + finalPrompt;

      if (metadata.isQuoted) {
        if (metadata.quoteMetaData.hasImage) {
          message =
            this.iconPrefix +
            (await this.generateImageCompletion(
              finalPrompt,
              metadata.quoteMetaData.imgMetaData,
              metadata.quoteMetaData.message
            ));
        } else {
          message = this.iconPrefix + (await this.generateCompletion(sender, finalPrompt));
        }
      } else {
        if (metadata.hasImage) {
          message =
            this.iconPrefix +
            (await this.generateImageCompletion(
              finalPrompt,
              metadata.imgMetaData,
              metadata.message.message
            ));
        } else {
          message = this.iconPrefix + (await this.generateCompletion(sender, finalPrompt));
        }
      }

      handle({ text: message });
    } catch (err) {
      handle(
        '',
        '[Error] An error occurred. Check the console for details.\n[Message]: ' + String(err)
      );
    }
  }
}

export { GeminiModel };

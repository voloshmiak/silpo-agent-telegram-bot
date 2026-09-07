import 'dotenv/config.js';
import { Api, Bot } from 'grammy';

const BOT_TOKEN = process.env.BOT_TOKEN;

if (!BOT_TOKEN) throw new Error('No .env!');

const bot = new Bot(BOT_TOKEN);
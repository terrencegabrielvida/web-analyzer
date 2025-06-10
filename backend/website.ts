import axios from 'axios';
import * as cheerio from 'cheerio';

export async function getWebsiteContent(url: string): Promise<string> {
  const { data } = await axios.get(url);
  const $ = cheerio.load(data);
  const text = $('body').text();
  return text.replace(/\s+/g, ' ').trim().slice(0, 4000);
}

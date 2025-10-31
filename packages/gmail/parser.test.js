import { describe, test, expect } from '@jest/globals';
import { findUnsubscribeLinkInHtml, extractUnsubscribeInfo } from './parser.js';

describe('Gmail Parser', () => {
  test('findUnsubscribeLinkInHtml extracts unsubscribe link', () => {
    const html = '<a href="https://example.com/unsubscribe">Unsubscribe here</a>';
    const link = findUnsubscribeLinkInHtml(html);
    expect(link).toBe('https://example.com/unsubscribe');
  });

  test('findUnsubscribeLinkInHtml returns null when no link found', () => {
    const html = '<p>No unsubscribe link here</p>';
    const link = findUnsubscribeLinkInHtml(html);
    expect(link).toBe(null);
  });

  test('extractUnsubscribeInfo parses List-Unsubscribe header with URL', () => {
    const parsed = {
      listUnsubscribe: '<https://example.com/unsubscribe>',
      html: '',
    };
    const info = extractUnsubscribeInfo(parsed);
    expect(info.url).toBe('https://example.com/unsubscribe');
    expect(info.mailto).toBe(null);
  });

  test('extractUnsubscribeInfo parses List-Unsubscribe header with mailto', () => {
    const parsed = {
      listUnsubscribe: '<mailto:unsubscribe@example.com>',
      html: '',
    };
    const info = extractUnsubscribeInfo(parsed);
    expect(info.mailto).toBe('unsubscribe@example.com');
    expect(info.url).toBe(null);
  });

  test('extractUnsubscribeInfo parses both URL and mailto', () => {
    const parsed = {
      listUnsubscribe: '<https://example.com/unsub>, <mailto:unsub@example.com>',
      html: '',
    };
    const info = extractUnsubscribeInfo(parsed);
    expect(info.url).toBe('https://example.com/unsub');
    expect(info.mailto).toBe('unsub@example.com');
  });
});

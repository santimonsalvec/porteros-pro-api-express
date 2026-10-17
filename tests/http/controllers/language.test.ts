import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { languageMiddleware } from '../../../src/controllers/language.js';

function probe() {
  const app = express();
  app.use(languageMiddleware);
  app.get('/probe', (req, res) => {
    res.json({ language: req.language });
  });
  return app;
}

describe('Accept-Language on every request (feature 032)', () => {
  it.each([
    ['en', 'en'],
    ['es', 'es'],
    ['en-US,en;q=0.9,es;q=0.8', 'en'],
    ['es-CO', 'es'],
    ['pt-BR', null],
  ])('reads %s as %s', async (header, expected) => {
    const response = await request(probe()).get('/probe').set('Accept-Language', header);
    expect(response.body).toEqual({ language: expected });
  });

  it('is null without the header', async () => {
    const response = await request(probe()).get('/probe');
    expect(response.body).toEqual({ language: null });
  });
});

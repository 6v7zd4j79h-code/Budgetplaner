// Der Passwortschutz: richtiges Passwort oeffnet, falsches nicht.

import test from 'node:test';
import assert from 'node:assert/strict';

import { deriveKey, newSalt, seal, unseal } from '../src/crypto.js';
import { emptyData } from '../src/budget.js';

test('verschluesseln und mit dem richtigen Passwort wieder oeffnen', async () => {
  const salt = newSalt();
  const book = emptyData();
  book.goals.push({ id: 'g', name: 'Urlaub', target: 50000, saved: 1200 });
  const sealed = await seal(await deriveKey('richtig', salt), salt, book);
  assert.ok(!sealed.data.includes('Urlaub'));
  assert.deepEqual(await unseal(await deriveKey('richtig', salt), sealed), book);
});

test('falsches Passwort oeffnet nichts', async () => {
  const salt = newSalt();
  const sealed = await seal(await deriveKey('richtig', salt), salt, emptyData());
  await assert.rejects(unseal(await deriveKey('falsch', salt), sealed));
});

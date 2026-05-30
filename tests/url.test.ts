import { describe, it, expect } from 'vitest'
import { normalizeUrl } from '@/src/engine/url'

describe('normalizeUrl', () => {
  it('fügt https hinzu, wenn Schema fehlt', () => {
    expect(normalizeUrl('example.com')).toBe('https://example.com/')
  })
  it('behält Pfad und entfernt Fragment', () => {
    expect(normalizeUrl('http://example.com/a#x')).toBe('http://example.com/a')
  })
  it('wirft bei ungültiger Eingabe', () => {
    expect(() => normalizeUrl('not a url')).toThrow()
  })
})

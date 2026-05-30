import { describe, it, expect } from 'vitest'
import { extractText } from '@/src/engine/text'

describe('extractText', () => {
  it('entfernt Tags und gibt sichtbaren Text', () => {
    expect(extractText('<h1>Hallo</h1><p>Welt</p>')).toBe('Hallo Welt')
  })
  it('entfernt script- und style-Inhalte', () => {
    const html = '<style>.a{color:red}</style><p>Text</p><script>var x=1</script>'
    expect(extractText(html)).toBe('Text')
  })
  it('kollabiert Whitespace', () => {
    expect(extractText('<p>a</p>\n\n   <p>b</p>')).toBe('a b')
  })
  it('kürzt auf 15000 Zeichen', () => {
    const long = '<p>' + 'x'.repeat(20000) + '</p>'
    expect(extractText(long).length).toBe(15000)
  })
})

import { cleanPageBody } from './page-html.js';

describe('cleanPageBody', () => {
  it('keeps the editor formatting', () => {
    const html = '<h2>About</h2><p><strong>Bold</strong> and <em>italic</em></p><ul><li>One</li></ul>';
    expect(cleanPageBody(html)).toBe(html);
  });

  it('removes scripts, styles and event handlers', () => {
    expect(cleanPageBody('<p onclick="x()">Hi<script>alert(1)</script></p><style>p{}</style>')).toBe('<p>Hi</p>');
  });

  it('makes links safe', () => {
    expect(cleanPageBody('<p><a href="javascript:alert(1)">x</a> <a href="https://talad.la">y</a></p>')).toBe(
      '<p><a target="_blank" rel="noopener noreferrer nofollow">x</a> <a href="https://talad.la" target="_blank" rel="noopener noreferrer nofollow">y</a></p>',
    );
  });

  it('leaves older plain-text bodies alone', () => {
    expect(cleanPageBody('# Heading\n\nTom & Jerry')).toBe('# Heading\n\nTom & Jerry');
  });

  it('drops empty paragraphs at the end', () => {
    expect(cleanPageBody('<h2>Hi</h2><p>Text</p><p></p><p></p>')).toBe('<h2>Hi</h2><p>Text</p>');
  });
});

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'

const source=file=>readFileSync(new URL('../'+file,import.meta.url),'utf8')

test('IMPETUS asset preserves the supplied complete original and its aspect ratio',()=>{
  const image=readFileSync(new URL('../src/assets/impetus-logo.png',import.meta.url))
  assert.equal(createHash('sha256').update(image).digest('hex'),'056791c82054ac1db132207858c5eb20f1b140a7835855ff8394f9e662cd8ba0')
  assert.equal(image.readUInt32BE(16),21500)
  assert.equal(image.readUInt32BE(20),2456)
  assert.ok(source('src/Brand.tsx').includes('width={21500} height={2456} alt="IMPETUS"'))
})

test('shared brand name and component cover navigation, login, mobile and footer',()=>{
  const app=source('src/App.tsx'),brand=source('src/Brand.tsx')
  assert.ok(brand.includes("applicationName='英霏特'"))
  for(const text of ['<Brand/>','<Brand variant="compact"/>','<Brand variant="login"/>','<span>{applicationName}</span>'])assert.ok(app.includes(text))
  assert.equal(app.includes('知序'),false)
  assert.equal(app.includes('className="brand-mark"'),false)
  assert.ok(app.includes('aria-label={applicationName}'))
})

test('logo layouts retain proportional sizing and adapt to narrow navigation and login',()=>{
  const css=source('src/branding.css')
  assert.match(css,/\.brand-logo\{[^}]*max-width:100%;height:auto;object-fit:contain/)
  assert.ok(css.includes('@media(max-width:760px)'))
  assert.ok(css.includes('.topbar .topbar-brand{display:block'))
  assert.ok(css.includes('.brand-lockup-login{align-items:center'))
  assert.ok(source('src/main.tsx').includes("import './branding.css'"))
})

test('document metadata and a readable small-size favicon match the renamed system',()=>{
  const html=source('index.html')
  assert.ok(html.includes('<title>英霏特</title>'))
  assert.ok(html.includes('href="/favicon.svg"'))
  assert.equal(html.includes('知序'),false)
  const icon=source('public/favicon.svg')
  assert.ok(icon.includes('viewBox="0 0 32 32"')&&icon.includes('<title>IMPETUS</title>'))
})

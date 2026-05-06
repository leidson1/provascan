import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

const args = process.argv.slice(2)

function readArg(flag, fallback = '') {
  const index = args.indexOf(flag)
  if (index === -1) return fallback
  return args[index + 1] || fallback
}

const imagePath = readArg('--image')
const targetUrl = readArg('--url', 'http://127.0.0.1:3007/omr-lab')
const headed = args.includes('--headed')

if (!imagePath) {
  console.error('Uso: node scripts/omr-lab-runner.mjs --image "C:/caminho/arquivo.jpg" [--url http://127.0.0.1:3007/omr-lab] [--headed]')
  process.exit(1)
}

const resolvedImagePath = path.resolve(imagePath)
const imageExists = await fs
  .access(resolvedImagePath)
  .then(() => true)
  .catch(() => false)

if (!imageExists) {
  console.error(`Imagem nao encontrada: ${resolvedImagePath}`)
  process.exit(1)
}

const outputDir = path.resolve('output/omr-lab')
await fs.mkdir(outputDir, { recursive: true })

const { chromium } = await import('playwright')
const browser = await chromium.launch({ headless: !headed })
const page = await browser.newPage({ viewport: { width: 1600, height: 1200 } })

try {
  await page.goto(targetUrl, { waitUntil: 'networkidle' })
  await page.setInputFiles('[data-testid="lab-file-input"]', resolvedImagePath)
  await page.waitForFunction(() => {
    const button = document.querySelector('[data-testid="lab-run-button"]')
    return button instanceof HTMLButtonElement && !button.disabled
  }, { timeout: 120000 })
  await page.evaluate(() => {
    const button = document.querySelector('[data-testid="lab-run-button"]')
    if (!(button instanceof HTMLButtonElement)) {
      throw new Error('Botao de execucao nao encontrado.')
    }
    button.click()
  })

  await page.waitForFunction(
    () => {
      const button = document.querySelector('[data-testid="lab-run-button"]')
      const rows = document.querySelectorAll('[data-testid^="lab-result-row-"]')
      return button?.textContent?.includes('Rodar bateria') && rows.length > 0
    },
    { timeout: 180000 }
  )

  const report = await page.evaluate(() => {
    const parseSummaryCard = (card) => {
      const lines = Array.from(card.children)
        .map((node) => node.textContent?.trim() || '')
        .filter(Boolean)
      return {
        label: lines[0] || '',
        value: lines[1] || '',
      }
    }

    const summaryCards = Array.from(document.querySelectorAll('[data-testid="lab-summary"] > div')).map(parseSummaryCard)
    const rows = Array.from(document.querySelectorAll('[data-testid^="lab-result-row-"]')).map((row) => {
      const cells = Array.from(row.querySelectorAll('td')).map((cell) => (cell.textContent || '').trim())
      const scenarioName =
        row.querySelector('td .font-medium')?.textContent?.trim() ||
        cells[0] ||
        ''
      return {
        scenario: scenarioName,
        status: cells[1] || '',
        qr: cells[2] || '',
        matches: cells[3] || '',
        empty: cells[4] || '',
        ambiguous: cells[5] || '',
        time: cells[6] || '',
        rotations: cells[7] || '',
      }
    })

    return { summaryCards, rows }
  })

  await page.screenshot({ path: path.join(outputDir, 'latest-run.png'), fullPage: true })
  await fs.writeFile(path.join(outputDir, 'latest-run.json'), JSON.stringify(report, null, 2), 'utf8')

  console.log(JSON.stringify(report, null, 2))
} finally {
  await browser.close()
}

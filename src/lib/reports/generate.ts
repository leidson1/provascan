import jsPDF from 'jspdf'
import * as XLSX from 'xlsx'
import type { Prova, Resultado, Turma, Disciplina, Aluno } from '@/types/database'

// ─── Types ─────────────────────────────────────────────────────────
export type ReportType = 'turma' | 'prova' | 'aluno'
export type ReportFormat = 'pdf' | 'excel'

type ResultadoComAluno = Resultado & {
  aluno?: { nome: string; numero: number | null }
}

type ProvaComJoins = Prova & {
  disciplina?: { nome: string }
  turma?: { serie: string; turma: string }
}

export interface ReportData {
  provas: ProvaComJoins[]
  resultados: ResultadoComAluno[]
  turmas: Turma[]
  disciplinas: Disciplina[]
  alunos: Aluno[]
  nomeInstituicao: string
}

export interface ReportFilters {
  tipo: ReportType
  turmaId: string
  disciplinaId: string
  provaId: string
  dataInicio: string
  dataFim: string
}

// ─── Helpers ───────────────────────────────────────────────────────
function formatDate(d: string | null) {
  if (!d) return '—'
  const date = new Date(d + 'T00:00:00')
  return date.toLocaleDateString('pt-BR')
}

function safeName(s: string) {
  return s.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 50)
}

// ─── PDF Report ────────────────────────────────────────────────────
function addPdfHeader(doc: jsPDF, title: string, subtitle: string, instituicao: string) {
  doc.setFontSize(16)
  doc.setFont('helvetica', 'bold')
  doc.text(instituicao || 'ProvaScan', 14, 18)

  doc.setFontSize(12)
  doc.setFont('helvetica', 'bold')
  doc.text(title, 14, 28)

  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.text(subtitle, 14, 34)

  doc.text(`Gerado em: ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`, 14, 40)

  doc.setDrawColor(99, 102, 241)
  doc.setLineWidth(0.5)
  doc.line(14, 43, 196, 43)

  return 48
}

function addPdfTable(
  doc: jsPDF,
  headers: string[],
  rows: string[][],
  startY: number,
  colWidths: number[]
) {
  const lineHeight = 6
  const pageHeight = 287
  let y = startY

  // Header
  doc.setFillColor(99, 102, 241)
  doc.rect(14, y - 4, 182, lineHeight + 2, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.setTextColor(255, 255, 255)
  let x = 16
  headers.forEach((h, i) => {
    doc.text(h, x, y)
    x += colWidths[i]
  })
  y += lineHeight + 1
  doc.setTextColor(0, 0, 0)

  // Rows
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  rows.forEach((row, rowIdx) => {
    if (y > pageHeight) {
      doc.addPage()
      y = 20
      // Re-draw header on new page
      doc.setFillColor(99, 102, 241)
      doc.rect(14, y - 4, 182, lineHeight + 2, 'F')
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(255, 255, 255)
      x = 16
      headers.forEach((h, i) => {
        doc.text(h, x, y)
        x += colWidths[i]
      })
      y += lineHeight + 1
      doc.setTextColor(0, 0, 0)
      doc.setFont('helvetica', 'normal')
    }

    if (rowIdx % 2 === 0) {
      doc.setFillColor(245, 245, 250)
      doc.rect(14, y - 3.5, 182, lineHeight, 'F')
    }

    x = 16
    row.forEach((cell, i) => {
      doc.text(String(cell).substring(0, 40), x, y)
      x += colWidths[i]
    })
    y += lineHeight
  })

  return y
}

// ─── Report: Por Turma ─────────────────────────────────────────────
function gerarRelatorioPorTurma(data: ReportData, filters: ReportFilters, format: ReportFormat) {
  const turma = data.turmas.find(t => String(t.id) === filters.turmaId)
  if (!turma) return

  const turmaName = `${turma.serie} ${turma.turma}`
  const alunosDaTurma = data.alunos.filter(a => a.turma_id === turma.id && a.ativo)
  const provasDaTurma = data.provas.filter(p => p.turma_id === turma.id && p.status !== 'excluida')

  // Filter by date range
  const provasFiltradas = provasDaTurma.filter(p => {
    if (filters.dataInicio && p.data && p.data < filters.dataInicio) return false
    if (filters.dataFim && p.data && p.data > filters.dataFim) return false
    if (filters.disciplinaId && String(p.disciplina_id) !== filters.disciplinaId) return false
    return true
  })

  // Build student summary across all filtered provas
  const resumo = alunosDaTurma.map(aluno => {
    const resultadosAluno = data.resultados.filter(r => r.aluno_id === aluno.id && provasFiltradas.some(p => p.id === r.prova_id))
    const presentes = resultadosAluno.filter(r => r.presenca === '*')
    const faltas = resultadosAluno.filter(r => r.presenca === 'F').length

    const mediaPercent = presentes.length > 0
      ? presentes.reduce((s, r) => s + (r.percentual ?? 0), 0) / presentes.length
      : 0
    const mediaNota = presentes.length > 0
      ? presentes.reduce((s, r) => s + (r.nota ?? r.acertos ?? 0), 0) / presentes.length
      : 0

    return {
      numero: aluno.numero ?? 0,
      nome: aluno.nome,
      provasFeitas: presentes.length,
      faltas,
      mediaPercent: Math.round(mediaPercent * 10) / 10,
      mediaNota: Math.round(mediaNota * 10) / 10,
    }
  }).sort((a, b) => a.numero - b.numero)

  const subtitle = [
    filters.disciplinaId ? `Disciplina: ${data.disciplinas.find(d => String(d.id) === filters.disciplinaId)?.nome ?? ''}` : '',
    filters.dataInicio ? `De: ${formatDate(filters.dataInicio)}` : '',
    filters.dataFim ? `Até: ${formatDate(filters.dataFim)}` : '',
    `${provasFiltradas.length} prova(s)`,
  ].filter(Boolean).join('  |  ')

  if (format === 'pdf') {
    const doc = new jsPDF()
    let y = addPdfHeader(doc, `Relatório por Turma: ${turmaName}`, subtitle, data.nomeInstituicao)

    // Summary stats
    doc.setFontSize(9)
    doc.setFont('helvetica', 'normal')
    doc.text(`Total de alunos: ${resumo.length}  |  Provas avaliadas: ${provasFiltradas.length}`, 14, y)
    y += 8

    const headers = ['Nº', 'Aluno', 'Provas', 'Faltas', 'Média %', 'Média Nota']
    const colWidths = [12, 70, 22, 22, 28, 28]
    const rows = resumo.map(r => [
      String(r.numero),
      r.nome,
      String(r.provasFeitas),
      String(r.faltas),
      `${r.mediaPercent}%`,
      String(r.mediaNota),
    ])

    addPdfTable(doc, headers, rows, y, colWidths)

    doc.save(`Relatorio_Turma_${safeName(turmaName)}.pdf`)
  } else {
    const ws = XLSX.utils.json_to_sheet(resumo.map(r => ({
      'Número': r.numero,
      'Aluno': r.nome,
      'Provas Feitas': r.provasFeitas,
      'Faltas': r.faltas,
      'Média (%)': r.mediaPercent,
      'Média Nota': r.mediaNota,
    })))
    ws['!cols'] = [{ wch: 8 }, { wch: 35 }, { wch: 14 }, { wch: 10 }, { wch: 12 }, { wch: 12 }]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Turma')
    XLSX.writeFile(wb, `Relatorio_Turma_${safeName(turmaName)}.xlsx`)
  }
}

// ─── Report: Por Prova ─────────────────────────────────────────────
function gerarRelatorioPorProva(data: ReportData, filters: ReportFilters, format: ReportFormat) {
  const prova = data.provas.find(p => String(p.id) === filters.provaId)
  if (!prova) return

  const discNome = prova.disciplina?.nome ?? 'Disciplina'
  const turmaName = prova.turma ? `${prova.turma.serie} ${prova.turma.turma}` : 'Turma'
  const resultadosProva = data.resultados.filter(r => r.prova_id === prova.id)

  const presentes = resultadosProva.filter(r => r.presenca === '*')
  const faltas = resultadosProva.filter(r => r.presenca === 'F')

  const mediaAcertos = presentes.length > 0
    ? presentes.reduce((s, r) => s + (r.acertos ?? 0), 0) / presentes.length
    : 0
  const mediaPercent = presentes.length > 0
    ? presentes.reduce((s, r) => s + (r.percentual ?? 0), 0) / presentes.length
    : 0

  const ranking = [...presentes].sort((a, b) => (b.acertos ?? 0) - (a.acertos ?? 0))

  // Per-question stats
  const gabarito = prova.gabarito ? prova.gabarito.split(',') : []
  const questaoStats = Array.from({ length: prova.num_questoes }, (_, i) => {
    const key = `q${i + 1}`
    const isAnulada = gabarito[i] === 'X'
    if (isAnulada) return { questao: i + 1, percentAcerto: 100, gabarito: 'ANULADA' }
    const total = presentes.length
    const acertos = presentes.filter(r => r.respostas && r.respostas[key] === 1).length
    return {
      questao: i + 1,
      percentAcerto: total > 0 ? Math.round((acertos / total) * 100) : 0,
      gabarito: gabarito[i] || '—',
    }
  })

  const subtitle = `${discNome}  |  ${turmaName}  |  Data: ${formatDate(prova.data)}  |  ${prova.num_questoes} questões`

  if (format === 'pdf') {
    const doc = new jsPDF()
    let y = addPdfHeader(doc, `Relatório da Prova #${prova.id} — ${prova.bloco || discNome}`, subtitle, data.nomeInstituicao)

    // Summary
    doc.setFontSize(9)
    doc.text(`Presentes: ${presentes.length}  |  Faltas: ${faltas.length}  |  Média acertos: ${mediaAcertos.toFixed(1)}/${prova.num_questoes}  |  Média: ${mediaPercent.toFixed(1)}%`, 14, y)
    y += 10

    // Ranking table
    doc.setFontSize(10)
    doc.setFont('helvetica', 'bold')
    doc.text('Resultado dos Alunos', 14, y)
    y += 6

    const headers = ['Pos', 'Aluno', 'Acertos', '%', 'Nota', 'Presença']
    const colWidths = [12, 70, 22, 22, 28, 28]

    const allResults = [...ranking, ...faltas].map((r, idx) => {
      const isPresente = r.presenca === '*'
      return [
        isPresente ? String(idx + 1) : '—',
        r.aluno?.nome ?? `Aluno #${r.aluno_id}`,
        isPresente ? `${r.acertos ?? 0}/${prova.num_questoes}` : '—',
        isPresente ? `${(r.percentual ?? 0).toFixed(0)}%` : '—',
        isPresente && r.nota != null ? r.nota.toFixed(1) : '—',
        isPresente ? 'Presente' : 'Falta',
      ]
    })

    y = addPdfTable(doc, headers, allResults, y, colWidths)
    y += 10

    // Per-question analysis
    if (y > 240) {
      doc.addPage()
      y = 20
    }
    doc.setFontSize(10)
    doc.setFont('helvetica', 'bold')
    doc.text('Análise por Questão', 14, y)
    y += 6

    const qHeaders = ['Questão', 'Gabarito', '% Acerto']
    const qWidths = [25, 25, 30]
    const qRows = questaoStats.map(q => [
      `Q${q.questao}`,
      q.gabarito,
      `${q.percentAcerto}%`,
    ])

    addPdfTable(doc, qHeaders, qRows, y, qWidths)

    doc.save(`Relatorio_Prova_${prova.id}_${safeName(discNome)}.pdf`)
  } else {
    const wb = XLSX.utils.book_new()

    // Sheet 1: Alunos
    const alunosSheet = XLSX.utils.json_to_sheet([...ranking, ...faltas].map((r, idx) => ({
      'Posição': r.presenca === '*' ? idx + 1 : '—',
      'Aluno': r.aluno?.nome ?? `Aluno #${r.aluno_id}`,
      'Acertos': r.presenca === '*' ? (r.acertos ?? 0) : '—',
      'Total Questões': prova.num_questoes,
      'Percentual (%)': r.presenca === '*' ? Math.round(r.percentual ?? 0) : '—',
      'Nota': r.presenca === '*' && r.nota != null ? r.nota : '—',
      'Presença': r.presenca === '*' ? 'Presente' : 'Falta',
    })))
    alunosSheet['!cols'] = [{ wch: 10 }, { wch: 35 }, { wch: 10 }, { wch: 16 }, { wch: 14 }, { wch: 10 }, { wch: 12 }]
    XLSX.utils.book_append_sheet(wb, alunosSheet, 'Alunos')

    // Sheet 2: Questões
    const questoesSheet = XLSX.utils.json_to_sheet(questaoStats.map(q => ({
      'Questão': `Q${q.questao}`,
      'Gabarito': q.gabarito,
      '% Acerto': q.percentAcerto,
    })))
    questoesSheet['!cols'] = [{ wch: 10 }, { wch: 12 }, { wch: 12 }]
    XLSX.utils.book_append_sheet(wb, questoesSheet, 'Questões')

    XLSX.writeFile(wb, `Relatorio_Prova_${prova.id}_${safeName(discNome)}.xlsx`)
  }
}

// ─── Report: Por Aluno ─────────────────────────────────────────────
function gerarRelatorioPorAluno(data: ReportData, filters: ReportFilters, format: ReportFormat) {
  const turma = data.turmas.find(t => String(t.id) === filters.turmaId)
  if (!turma) return

  const turmaName = `${turma.serie} ${turma.turma}`
  const alunosDaTurma = data.alunos.filter(a => a.turma_id === turma.id && a.ativo).sort((a, b) => (a.numero ?? 0) - (b.numero ?? 0))

  const provasFiltradas = data.provas.filter(p => {
    if (p.turma_id !== turma.id || p.status === 'excluida') return false
    if (filters.disciplinaId && String(p.disciplina_id) !== filters.disciplinaId) return false
    if (filters.dataInicio && p.data && p.data < filters.dataInicio) return false
    if (filters.dataFim && p.data && p.data > filters.dataFim) return false
    return true
  }).sort((a, b) => (a.data ?? '').localeCompare(b.data ?? ''))

  const subtitle = [
    `Turma: ${turmaName}`,
    filters.disciplinaId ? `Disciplina: ${data.disciplinas.find(d => String(d.id) === filters.disciplinaId)?.nome ?? ''}` : '',
    filters.dataInicio ? `De: ${formatDate(filters.dataInicio)}` : '',
    filters.dataFim ? `Até: ${formatDate(filters.dataFim)}` : '',
  ].filter(Boolean).join('  |  ')

  if (format === 'pdf') {
    const doc = new jsPDF()
    let y = addPdfHeader(doc, `Boletim Individual por Aluno`, subtitle, data.nomeInstituicao)

    alunosDaTurma.forEach((aluno, alunoIdx) => {
      if (alunoIdx > 0) {
        if (y > 220) {
          doc.addPage()
          y = 20
        } else {
          y += 6
          doc.setDrawColor(200, 200, 200)
          doc.setLineWidth(0.2)
          doc.line(14, y, 196, y)
          y += 6
        }
      }

      doc.setFontSize(10)
      doc.setFont('helvetica', 'bold')
      doc.text(`${aluno.numero ? `Nº ${aluno.numero} — ` : ''}${aluno.nome}`, 14, y)
      y += 6

      const resultadosAluno = provasFiltradas.map(prova => {
        const res = data.resultados.find(r => r.prova_id === prova.id && r.aluno_id === aluno.id)
        return {
          prova: prova.bloco || prova.disciplina?.nome || `Prova #${prova.id}`,
          data: formatDate(prova.data),
          presenca: res?.presenca === '*' ? 'Presente' : res?.presenca === 'F' ? 'Falta' : '—',
          acertos: res?.presenca === '*' ? `${res.acertos ?? 0}/${prova.num_questoes}` : '—',
          percentual: res?.presenca === '*' ? `${(res.percentual ?? 0).toFixed(0)}%` : '—',
          nota: res?.presenca === '*' && res.nota != null ? res.nota.toFixed(1) : '—',
        }
      })

      if (resultadosAluno.length === 0) {
        doc.setFontSize(8)
        doc.setFont('helvetica', 'normal')
        doc.text('Nenhuma prova registrada no período.', 16, y)
        y += 6
      } else {
        const headers = ['Prova', 'Data', 'Presença', 'Acertos', '%', 'Nota']
        const colWidths = [50, 22, 22, 22, 18, 18]
        const rows = resultadosAluno.map(r => [r.prova, r.data, r.presenca, r.acertos, r.percentual, r.nota])
        y = addPdfTable(doc, headers, rows, y, colWidths)
        y += 2
      }
    })

    doc.save(`Boletim_${safeName(turmaName)}.pdf`)
  } else {
    const wb = XLSX.utils.book_new()

    // One big sheet with all students
    const allRows: Record<string, string | number>[] = []
    alunosDaTurma.forEach(aluno => {
      provasFiltradas.forEach(prova => {
        const res = data.resultados.find(r => r.prova_id === prova.id && r.aluno_id === aluno.id)
        allRows.push({
          'Nº': aluno.numero ?? '',
          'Aluno': aluno.nome,
          'Prova': prova.bloco || prova.disciplina?.nome || `Prova #${prova.id}`,
          'Data': formatDate(prova.data),
          'Presença': res?.presenca === '*' ? 'Presente' : res?.presenca === 'F' ? 'Falta' : '—',
          'Acertos': res?.presenca === '*' ? (res.acertos ?? 0) : '—',
          'Total': prova.num_questoes,
          'Percentual (%)': res?.presenca === '*' ? Math.round(res.percentual ?? 0) : '—',
          'Nota': res?.presenca === '*' && res.nota != null ? res.nota : '—',
        })
      })
    })

    const ws = XLSX.utils.json_to_sheet(allRows)
    ws['!cols'] = [{ wch: 6 }, { wch: 30 }, { wch: 25 }, { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 8 }, { wch: 14 }, { wch: 10 }]
    XLSX.utils.book_append_sheet(wb, ws, 'Boletim')

    XLSX.writeFile(wb, `Boletim_${safeName(turmaName)}.xlsx`)
  }
}

// ─── Main Export ───────────────────────────────────────────────────
export function gerarRelatorio(data: ReportData, filters: ReportFilters, format: ReportFormat) {
  // Normalize "all" placeholders to empty string
  if (filters.turmaId === '__all__') filters.turmaId = ''
  if (filters.disciplinaId === '__all__') filters.disciplinaId = ''

  switch (filters.tipo) {
    case 'turma':
      return gerarRelatorioPorTurma(data, filters, format)
    case 'prova':
      return gerarRelatorioPorProva(data, filters, format)
    case 'aluno':
      return gerarRelatorioPorAluno(data, filters, format)
  }
}

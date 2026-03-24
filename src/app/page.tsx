import Link from 'next/link'
import { ScanLine, Camera, FileText, BarChart3, CheckCircle, Smartphone, Shield, GraduationCap, Clock, Users } from 'lucide-react'

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="border-b bg-white/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 bg-indigo-500 rounded-lg flex items-center justify-center">
              <ScanLine className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-bold text-slate-900">ProvaScan</span>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/login" className="text-sm font-medium text-slate-600 hover:text-slate-900 px-4 py-2">
              Entrar
            </Link>
            <Link href="/signup" className="text-sm font-medium text-white bg-indigo-500 hover:bg-indigo-600 px-4 py-2 rounded-lg transition-colors">
              Criar Conta
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-50 via-white to-violet-50" />
        <div className="relative max-w-6xl mx-auto px-4 pt-20 pb-24 text-center">
          <div className="inline-flex items-center gap-2 bg-indigo-50 text-indigo-700 text-sm font-medium px-4 py-1.5 rounded-full mb-6">
            <GraduationCap className="w-4 h-4" />
            Ferramenta gratuita para educadores
          </div>
          <h1 className="text-4xl md:text-6xl font-bold text-slate-900 leading-tight mb-6">
            Correção de provas<br />
            <span className="text-indigo-500">pela câmera do celular</span>
          </h1>
          <p className="text-lg md:text-xl text-slate-600 max-w-2xl mx-auto mb-10">
            O ProvaScan é uma plataforma gratuita que permite ao professor imprimir
            cartões-resposta, fotografar com o celular e obter as notas automaticamente.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link href="/signup" className="w-full sm:w-auto text-center text-lg font-semibold text-white bg-indigo-500 hover:bg-indigo-600 px-8 py-4 rounded-xl transition-colors shadow-lg shadow-indigo-500/25">
              Começar Gratuitamente
            </Link>
            <a href="#como-funciona" className="w-full sm:w-auto text-center text-lg font-medium text-slate-700 bg-white hover:bg-slate-50 px-8 py-4 rounded-xl border transition-colors">
              Saiba Como Funciona
            </a>
          </div>
        </div>
      </section>

      {/* O que é */}
      <section className="py-16 bg-white border-b">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <h2 className="text-2xl md:text-3xl font-bold text-slate-900 mb-4">
            O que é o ProvaScan?
          </h2>
          <p className="text-lg text-slate-600 leading-relaxed">
            O ProvaScan é um sistema de correção óptica de provas objetivas desenvolvido
            para facilitar o dia a dia do professor. Com ele, você cria provas, imprime
            cartões-resposta com QR Code, e utiliza a câmera do próprio celular para ler
            e corrigir as respostas dos alunos de forma automática. Os resultados ficam
            organizados com estatísticas detalhadas por questão, turma e aluno.
          </p>
        </div>
      </section>

      {/* Como Funciona */}
      <section id="como-funciona" className="py-20 bg-white">
        <div className="max-w-6xl mx-auto px-4">
          <h2 className="text-3xl font-bold text-center text-slate-900 mb-4">
            Como funciona
          </h2>
          <p className="text-center text-slate-500 mb-16 max-w-xl mx-auto">
            Em três passos simples, você já está corrigindo provas com o celular
          </p>
          <div className="grid md:grid-cols-3 gap-8">
            <StepCard
              step="1"
              icon={<FileText className="w-7 h-7" />}
              title="Crie a prova e imprima"
              description="Cadastre as questões, defina o gabarito e imprima os cartões-resposta personalizados com QR Code."
            />
            <StepCard
              step="2"
              icon={<Camera className="w-7 h-7" />}
              title="Fotografe os cartões"
              description="Use a câmera do celular para escanear cada cartão preenchido. A leitura óptica detecta as respostas automaticamente."
            />
            <StepCard
              step="3"
              icon={<BarChart3 className="w-7 h-7" />}
              title="Veja os resultados"
              description="Notas calculadas na hora, estatísticas por questão, ranking de alunos e análise de dificuldade."
            />
          </div>
        </div>
      </section>

      {/* Recursos */}
      <section className="py-20 bg-slate-50">
        <div className="max-w-6xl mx-auto px-4">
          <h2 className="text-3xl font-bold text-center text-slate-900 mb-4">
            Recursos da plataforma
          </h2>
          <p className="text-center text-slate-500 mb-16 max-w-xl mx-auto">
            Tudo o que o professor precisa para agilizar a correção de provas
          </p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            <FeatureCard
              icon={<Smartphone className="w-6 h-6 text-indigo-500" />}
              title="Funciona no celular"
              description="Não precisa de scanner ou equipamento especial. A câmera do seu celular é tudo que você precisa."
            />
            <FeatureCard
              icon={<Clock className="w-6 h-6 text-amber-500" />}
              title="Correção instantânea"
              description="Fotografou, corrigiu. As notas são calculadas automaticamente em segundos."
            />
            <FeatureCard
              icon={<BarChart3 className="w-6 h-6 text-emerald-500" />}
              title="Estatísticas detalhadas"
              description="Saiba quais questões foram difíceis, quem se destacou e onde reforçar o conteúdo."
            />
            <FeatureCard
              icon={<CheckCircle className="w-6 h-6 text-violet-500" />}
              title="Até 50 questões"
              description="Suporta provas de 1 a 50 questões com 4 ou 5 alternativas por questão."
            />
            <FeatureCard
              icon={<Users className="w-6 h-6 text-sky-500" />}
              title="Gestão de turmas"
              description="Organize seus alunos por turma, série e turno. Importe listas completas de uma só vez."
            />
            <FeatureCard
              icon={<Shield className="w-6 h-6 text-rose-500" />}
              title="Privacidade e LGPD"
              description="Apenas nomes de alunos são armazenados. Sem CPF, sem dados sensíveis. Seus dados são seus."
            />
          </div>
        </div>
      </section>

      {/* Público-alvo */}
      <section className="py-20 bg-white">
        <div className="max-w-6xl mx-auto px-4">
          <h2 className="text-3xl font-bold text-center text-slate-900 mb-4">
            Para quem é o ProvaScan?
          </h2>
          <p className="text-center text-slate-500 mb-12 max-w-xl mx-auto">
            Desenvolvido pensando na realidade do professor brasileiro
          </p>
          <div className="grid md:grid-cols-3 gap-8">
            <div className="text-center p-6">
              <div className="w-14 h-14 bg-indigo-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <GraduationCap className="w-7 h-7 text-indigo-500" />
              </div>
              <h3 className="font-semibold text-slate-900 mb-2">Professores</h3>
              <p className="text-sm text-slate-500">
                De qualquer disciplina e nível de ensino que aplicam provas objetivas
                e querem economizar tempo na correção.
              </p>
            </div>
            <div className="text-center p-6">
              <div className="w-14 h-14 bg-emerald-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Users className="w-7 h-7 text-emerald-500" />
              </div>
              <h3 className="font-semibold text-slate-900 mb-2">Coordenadores</h3>
              <p className="text-sm text-slate-500">
                Que precisam acompanhar o desempenho dos alunos e identificar
                pontos de atenção por turma ou disciplina.
              </p>
            </div>
            <div className="text-center p-6">
              <div className="w-14 h-14 bg-violet-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <FileText className="w-7 h-7 text-violet-500" />
              </div>
              <h3 className="font-semibold text-slate-900 mb-2">Escolas públicas e privadas</h3>
              <p className="text-sm text-slate-500">
                Que buscam uma solução gratuita, prática e sem burocracia
                para otimizar o processo avaliativo.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 bg-gradient-to-br from-indigo-600 to-violet-700">
        <div className="max-w-3xl mx-auto px-4 text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
            Simplifique suas correções hoje mesmo
          </h2>
          <p className="text-lg text-indigo-100 mb-8">
            Cadastre-se gratuitamente e comece a usar o ProvaScan em poucos minutos.
            Sem cartão de crédito, sem período de teste. Gratuito para sempre.
          </p>
          <Link href="/signup" className="inline-block text-lg font-semibold text-indigo-600 bg-white hover:bg-indigo-50 px-8 py-4 rounded-xl transition-colors shadow-lg">
            Criar Conta Gratuita
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-10 bg-slate-900 text-slate-400 text-sm">
        <div className="max-w-6xl mx-auto px-4">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 bg-indigo-500 rounded-md flex items-center justify-center">
                <ScanLine className="w-4 h-4 text-white" />
              </div>
              <span className="font-medium text-slate-300">ProvaScan</span>
            </div>
            <div className="flex items-center gap-6">
              <Link href="/termos" className="hover:text-white transition-colors">Termos de Uso</Link>
              <a href="https://github.com/leidson1/provascan" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">GitHub</a>
            </div>
            <p className="text-slate-500">&copy; 2026 ProvaScan. Projeto open source (MIT).</p>
          </div>
        </div>
      </footer>
    </div>
  )
}

function StepCard({ step, icon, title, description }: { step: string, icon: React.ReactNode, title: string, description: string }) {
  return (
    <div className="text-center">
      <div className="w-16 h-16 bg-indigo-50 rounded-2xl flex items-center justify-center mx-auto mb-4 text-indigo-500">
        {icon}
      </div>
      <div className="inline-flex items-center justify-center w-8 h-8 bg-indigo-500 text-white text-sm font-bold rounded-full mb-3">
        {step}
      </div>
      <h3 className="text-lg font-semibold text-slate-900 mb-2">{title}</h3>
      <p className="text-slate-500">{description}</p>
    </div>
  )
}

function FeatureCard({ icon, title, description }: { icon: React.ReactNode, title: string, description: string }) {
  return (
    <div className="bg-white rounded-xl p-6 border hover:shadow-md transition-shadow">
      <div className="mb-3">{icon}</div>
      <h3 className="font-semibold text-slate-900 mb-1">{title}</h3>
      <p className="text-sm text-slate-500">{description}</p>
    </div>
  )
}

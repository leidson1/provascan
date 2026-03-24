import Link from 'next/link'
import { ScanLine, Camera, FileText, BarChart3, CheckCircle, Smartphone, Shield, Zap } from 'lucide-react'

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
              Criar Conta Gratis
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-50 via-white to-violet-50" />
        <div className="relative max-w-6xl mx-auto px-4 pt-20 pb-24 text-center">
          <div className="inline-flex items-center gap-2 bg-indigo-50 text-indigo-700 text-sm font-medium px-4 py-1.5 rounded-full mb-6">
            <Zap className="w-4 h-4" />
            100% Gratuito para Professores
          </div>
          <h1 className="text-4xl md:text-6xl font-bold text-slate-900 leading-tight mb-6">
            Corrija provas em<br />
            <span className="text-indigo-500">segundos com a camera</span>
          </h1>
          <p className="text-lg md:text-xl text-slate-600 max-w-2xl mx-auto mb-10">
            Imprima cartoes-resposta, fotografe com o celular e tenha as notas
            prontas automaticamente. Sem complicacao, sem custo.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link href="/signup" className="w-full sm:w-auto text-center text-lg font-semibold text-white bg-indigo-500 hover:bg-indigo-600 px-8 py-4 rounded-xl transition-colors shadow-lg shadow-indigo-500/25">
              Comecar Agora
            </Link>
            <a href="#como-funciona" className="w-full sm:w-auto text-center text-lg font-medium text-slate-700 bg-white hover:bg-slate-50 px-8 py-4 rounded-xl border transition-colors">
              Como Funciona
            </a>
          </div>
        </div>
      </section>

      {/* Como Funciona */}
      <section id="como-funciona" className="py-20 bg-white">
        <div className="max-w-6xl mx-auto px-4">
          <h2 className="text-3xl font-bold text-center text-slate-900 mb-4">
            Simples como 1, 2, 3
          </h2>
          <p className="text-center text-slate-500 mb-16 max-w-xl mx-auto">
            Em poucos minutos voce ja esta corrigindo provas com o celular
          </p>
          <div className="grid md:grid-cols-3 gap-8">
            <StepCard
              step="1"
              icon={<FileText className="w-7 h-7" />}
              title="Crie a prova e imprima"
              description="Cadastre as questoes, defina o gabarito e imprima os cartoes-resposta personalizados com QR Code."
            />
            <StepCard
              step="2"
              icon={<Camera className="w-7 h-7" />}
              title="Fotografe os cartoes"
              description="Use a camera do celular para escanear cada cartao preenchido. A leitura optica detecta as respostas automaticamente."
            />
            <StepCard
              step="3"
              icon={<BarChart3 className="w-7 h-7" />}
              title="Veja os resultados"
              description="Notas calculadas na hora, estatisticas por questao, ranking de alunos e analise de dificuldade."
            />
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-20 bg-slate-50">
        <div className="max-w-6xl mx-auto px-4">
          <h2 className="text-3xl font-bold text-center text-slate-900 mb-16">
            Tudo que voce precisa
          </h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            <FeatureCard
              icon={<Smartphone className="w-6 h-6 text-indigo-500" />}
              title="Funciona no celular"
              description="Nao precisa de scanner. A camera do seu celular e tudo que voce precisa."
            />
            <FeatureCard
              icon={<Zap className="w-6 h-6 text-amber-500" />}
              title="Correcao instantanea"
              description="Fotografou, corrigiu. As notas sao calculadas automaticamente na hora."
            />
            <FeatureCard
              icon={<BarChart3 className="w-6 h-6 text-emerald-500" />}
              title="Estatisticas detalhadas"
              description="Saiba quais questoes foram dificeis, quem se destacou e onde reforcar o conteudo."
            />
            <FeatureCard
              icon={<CheckCircle className="w-6 h-6 text-violet-500" />}
              title="Ate 50 questoes"
              description="Suporta provas de 1 a 50 questoes com 4 ou 5 alternativas."
            />
            <FeatureCard
              icon={<Shield className="w-6 h-6 text-rose-500" />}
              title="Seus dados, sua privacidade"
              description="Apenas nomes de alunos. Sem CPF, sem dados sensiveis. Conforme LGPD."
            />
            <FeatureCard
              icon={<ScanLine className="w-6 h-6 text-sky-500" />}
              title="Codigo aberto"
              description="Open source sob licenca MIT. Transparencia total, sem coleta oculta."
            />
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 bg-gradient-to-br from-indigo-600 to-violet-700">
        <div className="max-w-3xl mx-auto px-4 text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
            Pronto para simplificar suas correcoes?
          </h2>
          <p className="text-lg text-indigo-100 mb-8">
            Junte-se a professores de todo o Brasil que ja usam o ProvaScan.
          </p>
          <Link href="/signup" className="inline-block text-lg font-semibold text-indigo-600 bg-white hover:bg-indigo-50 px-8 py-4 rounded-xl transition-colors shadow-lg">
            Criar Conta Gratuita
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 bg-slate-900 text-slate-400 text-sm">
        <div className="max-w-6xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <ScanLine className="w-4 h-4" />
            <span>ProvaScan</span>
          </div>
          <div className="flex items-center gap-6">
            <Link href="/termos" className="hover:text-white transition-colors">Termos de Uso</Link>
          </div>
          <p>&copy; 2026 ProvaScan. Open Source (MIT).</p>
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

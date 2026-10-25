// TJ-ARCH-MOB-001 compliant
// Route components: each reads its params and hands them to a feature view.
import { useParams } from '@tanstack/react-router'
import { ChatView } from '../../features/chat/presentation/chat-view'
import { HomeView } from '../../features/home/presentation/home-view'
import { CaseView } from '../../features/patients/presentation/case-view'
import { PatientView } from '../../features/patients/presentation/patient-view'
import { useDocumentTitle } from '../../shared/dom/use-document-title'
import { useShellRoute } from './use-shell-route'

export function HomePage() {
  return <HomeView />
}

export function PatientPage() {
  const { patientId } = useParams({ from: '/p/$patientId' })
  return <PatientView key={patientId} patientId={patientId} />
}

export function CasePage() {
  const { caseId } = useParams({ from: '/c/$caseId' })
  return <CaseView key={caseId} caseId={caseId} />
}

export function ChatPage() {
  const route = useShellRoute()
  const title = route.name === 'chat' ? route.title : null
  useDocumentTitle(title)
  return <ChatView title={title} />
}

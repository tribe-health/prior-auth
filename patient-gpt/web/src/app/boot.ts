// TJ-ARCH-MOB-001 compliant
// Host transport injection: chosen once, then handed to every entity
// transport and to the run store. Components never see a transport.
import { createMemoryLocalLane } from '../features/conversations/data/memory-local-lane'
import { createPgliteLocalLane } from '../features/conversations/data/pglite-local-lane'
import { registerConversationEntity } from '../features/conversations/data/conversation-entity'
import { configureDrafts } from '../features/conversations/data/draft-repository'
import { configureRunStore } from '../features/chat/data/run-store'
import { registerPatientEntities } from '../features/patients/data/patient-entities'
import { registerSessionEntity } from '../features/session/data/session-entity'
import { selectTransport } from './transport/select-transport'
import type { PatientGptTransport } from './transport/transport'

export function boot(transport: PatientGptTransport = selectTransport()): PatientGptTransport {
  const localLane = transport.host === 'web' ? createPgliteLocalLane() : createMemoryLocalLane()
  registerSessionEntity(transport)
  registerPatientEntities(transport)
  registerConversationEntity(transport, localLane)
  configureDrafts(localLane)
  configureRunStore(transport)
  return transport
}

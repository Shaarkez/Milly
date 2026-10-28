type GroupableMessage = { sender_id: string; created_at: string }

export function messagesBelongToSameGroup(first: GroupableMessage, second: GroupableMessage) {
  const firstTime = new Date(first.created_at)
  const secondTime = new Date(second.created_at)
  const elapsed = secondTime.getTime() - firstTime.getTime()
  return first.sender_id === second.sender_id
    && firstTime.toDateString() === secondTime.toDateString()
    && elapsed >= 0
    && elapsed <= 5 * 60 * 1000
}

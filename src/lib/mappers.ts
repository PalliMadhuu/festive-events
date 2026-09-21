export function iso(value: unknown): string {
  if (value == null || value === '') return new Date().toISOString();
  if (value instanceof Date) return value.toISOString();
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toISOString();
}

export function isoOrNull(value: unknown): string | null {
  if (value == null || value === '') return null;
  return iso(value);
}

export function num(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function strArr(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(String).filter(Boolean);
}

export function toUser(row: any) {
  return {
    uid: row.uid,
    displayName: row.display_name || '',
    email: row.email || '',
    phoneNumber: row.phone_number || undefined,
    photoURL: row.photo_url || undefined,
    streetId: row.street_id || undefined,
    streetName: row.street_name || undefined,
    role: row.role === 'superAdmin' ? 'superAdmin' : 'user',
    fcmToken: row.fcm_token || undefined,
    removed: !!row.removed,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

export function toStreet(row: any) {
  return {
    id: row.id,
    name: row.name,
    description: row.description || '',
    createdBy: row.created_by,
    createdAt: iso(row.created_at),
  };
}

export function toFestival(row: any) {
  return {
    id: row.id,
    name: row.name,
    year: num(row.year),
    date: row.date || '',
    emoji: row.emoji || undefined,
    imageUrl: row.image_url || undefined,
    createdBy: row.created_by,
    createdAt: iso(row.created_at),
  };
}

export function toEvent(row: any) {
  return {
    id: row.id,
    streetId: row.street_id,
    streetName: row.street_name,
    festivalName: row.festival_name,
    year: num(row.year),
    eventName: row.event_name,
    description: row.description || '',
    coverImageUrl: row.cover_image_url || undefined,
    primaryOrganizerId: row.primary_organizer_id,
    primaryOrganizerName: row.primary_organizer_name || '',
    organizerIds: strArr(row.organizer_ids),
    memberCount: num(row.member_count),
    status: row.status || 'active',
    slot: num(row.slot, 1) as 1 | 2,
    totalExpenses: num(row.total_expenses),
    totalDonations: num(row.total_donations),
    totalStreetDonations: num(row.total_street_donations),
    subEventCount: num(row.sub_event_count),
    galleryEnabled: !!row.gallery_enabled,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

export function toMember(row: any) {
  return {
    id: row.user_id,
    userId: row.user_id,
    uid: row.user_id,
    displayName: row.display_name || '',
    photoURL: row.photo_url || undefined,
    role: row.role,
    joinedAt: iso(row.joined_at),
    addedBy: row.added_by || undefined,
  };
}

export function toJoinRequest(row: any) {
  return {
    id: row.uid,
    eventId: row.event_id,
    uid: row.uid,
    displayName: row.display_name || '',
    photoURL: row.photo_url || undefined,
    email: row.email || '',
    status: row.status,
    message: row.message || '',
    requestedAt: iso(row.requested_at),
    reviewedAt: isoOrNull(row.reviewed_at) || undefined,
    reviewedBy: row.reviewed_by || undefined,
  };
}

export function toSubEvent(row: any) {
  return {
    id: row.id,
    eventId: row.event_id,
    name: row.name,
    description: row.description || undefined,
    date: row.date,
    time: row.time || undefined,
    location: row.location || undefined,
    coverImageUrl: row.cover_image_url || undefined,
    createdBy: row.created_by,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

export function toAlbum(row: any) {
  return {
    id: row.id,
    eventId: row.event_id,
    name: row.name,
    coverUrl: row.cover_url || undefined,
    mediaCount: num(row.media_count),
    createdBy: row.created_by,
    createdAt: iso(row.created_at),
  };
}

export function toExpense(row: any) {
  return {
    id: row.id,
    eventId: row.event_id,
    title: row.title || '',
    amount: num(row.amount),
    category: row.category || undefined,
    otherCategory: row.other_category || undefined,
    description: row.description || undefined,
    date: row.date || iso(row.created_at),
    subEventId: row.sub_event_id || undefined,
    receiptUrls: strArr(row.receipt_urls),
    uploadedBy: row.uploaded_by,
    uploadedByName: row.uploaded_by_name || '',
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
    updatedBy: row.updated_by || undefined,
    updatedByName: row.updated_by_name || undefined,
    deleted: !!row.deleted,
    deletedAt: isoOrNull(row.deleted_at) || undefined,
    deletedBy: row.deleted_by || undefined,
    deletedByName: row.deleted_by_name || undefined,
    deletionReason: row.deletion_reason || undefined,
  };
}

export function toDonation(row: any) {
  return {
    id: row.id,
    eventId: row.event_id,
    donorName: row.donor_name || '',
    amount: num(row.amount),
    note: row.note || '',
    date: row.date || iso(row.created_at),
    photoUrl: row.photo_url || undefined,
    status: row.status === 'pending' ? 'pending' : 'given',
    uploadedBy: row.uploaded_by,
    uploadedByName: row.uploaded_by_name || '',
    likedBy: strArr(row.liked_by),
    likeCount: strArr(row.liked_by).length,
    createdAt: iso(row.created_at),
    updatedAt: isoOrNull(row.updated_at) || undefined,
    updatedBy: row.updated_by || undefined,
    updatedByName: row.updated_by_name || undefined,
    deleted: !!row.deleted,
    deletedAt: isoOrNull(row.deleted_at) || undefined,
    deletedBy: row.deleted_by || undefined,
    deletedByName: row.deleted_by_name || undefined,
    deletionReason: row.deletion_reason || undefined,
  };
}
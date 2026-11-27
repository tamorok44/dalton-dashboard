// Public raw-profile uploads are suspended until a private archive is
// separately authorized, provisioned and tested. No fallback to a public store.
export function dailySnapshotStoreConfigured(){return false;}
export function disabledArchiveMetadata(date){
  if(!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(date))throw new Error('Ungültiges Snapshot-Datum');
  return {date,createdAt:new Date().toISOString(),archiveStatus:'disabled',archiveReason:'privacy_public_raw_archive_suspended',url:null};
}
export async function saveDailySnapshot(){
  throw new Error('Öffentliche Rohdatenarchivierung aus Datenschutzgründen deaktiviert');
}

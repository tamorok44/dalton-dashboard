// Compatibility endpoint: Preview credentials must never mint production devices.
export const config={maxDuration:15};
export default async function handler(req,res){
  res.setHeader('Cache-Control','private, no-store');
  return res.status(410).json({error:'Automatische Geräteübernahme deaktiviert. Bitte einen regulären Einrichtungscode für die Zielumgebung verwenden.'});
}

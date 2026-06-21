const WHATSAPP_TEMPLATES = {
  parent_portal_link: ({ parentName, studentName, portalUrl }) =>
    [
      `Hello ${parentName || ""},`,
      "",
      `Here is your private parent portal for ${studentName} at Chess Klub Mysuru.`,
      `Attendance, invoices and receipts: ${portalUrl}`,
      "",
      "This link is private. Please don't share it.",
    ].join("\n"),
};

export function renderWhatsAppTemplate(name, context) {
  const template = WHATSAPP_TEMPLATES[name];
  if (!template) throw new Error(`Unknown WhatsApp template: ${name}`);
  return template(context);
}

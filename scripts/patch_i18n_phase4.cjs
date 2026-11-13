const fs = require('fs');

{
  const p = 'Client/src/lib/i18n/en.js';
  let s = fs.readFileSync(p, 'utf8');
  if (!s.includes("nav.automations")) {
    s = s.replace('    "nav.chat": "Chat",', '    "nav.chat": "Chat",\n    \'nav.automations\': \'Automations\',');
  }
  if (!s.includes('automations.title')) {
    const block = `
    'automations.title': 'Automations',
    'automations.subtitle': 'Manage trigger-based rules, templates, and execution history.',
    'automations.new': '+ New Automation',
    'automations.loading': 'Loading automations…',
    'automations.loadFailed': "Couldn't load automations",
    'automations.empty': 'No automations yet.',
    'automations.emptyHint': 'Create a rule or install built-in templates.',
    'automations.installTemplates': 'Install Templates',
    'automations.templatesInstalled': 'Templates installed',
    'automations.col.name': 'Name',
    'automations.col.trigger': 'Trigger',
    'automations.col.status': 'Status',
    'automations.col.actions': 'Actions',
    'automations.enabled': 'Enabled',
    'automations.disabled': 'Disabled',
    'automations.deleteConfirm': 'Delete automation "{name}"?',
    'automations.deleted': 'Automation deleted.',
    'automations.saved': 'Automation saved.',
    'automations.test': 'Test',
    'automations.testResult': 'Test result',
    'automations.runs': 'Runs',
    'automations.runHistory': 'Execution history',
    'automations.noRuns': 'No runs found.',
    'automations.form.new': 'New Automation',
    'automations.form.edit': 'Edit Automation',
    'automations.form.name': 'Name',
    'automations.form.description': 'Description',
    'automations.form.trigger': 'Trigger',
    'automations.form.enabled': 'Enabled',
    'automations.form.cooldown': 'Cooldown (minutes)',
    'automations.form.actionsJson': 'Actions (JSON array)',
    'automations.form.conditionsJson': 'Conditions (JSON array)',
    'automations.form.save': 'Save automation',
    'automations.form.invalidJson': 'Actions/conditions must be valid JSON.',
    'automations.form.testEventJson': 'Test event data (JSON object, optional)',
    'automations.form.createFirst': 'Save the automation before testing.',
`;
    s = s.replace("    'mod.automations': 'Automation Rules',", "    'mod.automations': 'Automation Rules'," + block);
  }
  fs.writeFileSync(p, s, 'utf8');
}

{
  const p = 'Client/src/lib/i18n/ar.js';
  let s = fs.readFileSync(p, 'utf8');
  if (!s.includes("nav.automations")) {
    s = s.replace('    "nav.chat": "المحادثة",', '    "nav.chat": "المحادثة",\n    \'nav.automations\': \'الأتمتة\',');
  }
  if (!s.includes('automations.title')) {
    const block = `
    'automations.title': 'الأتمتة',
    'automations.subtitle': 'إدارة القواعد المبنية على الأحداث والقوالب وسجل التنفيذ.',
    'automations.new': '+ أتمتة جديدة',
    'automations.loading': 'جارٍ تحميل الأتمتة…',
    'automations.loadFailed': 'تعذّر تحميل الأتمتة',
    'automations.empty': 'لا توجد أتمتة بعد.',
    'automations.emptyHint': 'أنشئ قاعدة أو ثبّت القوالب الجاهزة.',
    'automations.installTemplates': 'تثبيت القوالب',
    'automations.templatesInstalled': 'تم تثبيت القوالب',
    'automations.col.name': 'الاسم',
    'automations.col.trigger': 'المشغّل',
    'automations.col.status': 'الحالة',
    'automations.col.actions': 'إجراءات',
    'automations.enabled': 'مفعّل',
    'automations.disabled': 'معطّل',
    'automations.deleteConfirm': 'حذف الأتمتة "{name}"؟',
    'automations.deleted': 'تم حذف الأتمتة.',
    'automations.saved': 'تم حفظ الأتمتة.',
    'automations.test': 'اختبار',
    'automations.testResult': 'نتيجة الاختبار',
    'automations.runs': 'التنفيذات',
    'automations.runHistory': 'سجل التنفيذ',
    'automations.noRuns': 'لا توجد تنفيذات.',
    'automations.form.new': 'أتمتة جديدة',
    'automations.form.edit': 'تعديل الأتمتة',
    'automations.form.name': 'الاسم',
    'automations.form.description': 'الوصف',
    'automations.form.trigger': 'المشغّل',
    'automations.form.enabled': 'مفعّل',
    'automations.form.cooldown': 'فترة التهدئة (دقائق)',
    'automations.form.actionsJson': 'الإجراءات (مصفوفة JSON)',
    'automations.form.conditionsJson': 'الشروط (مصفوفة JSON)',
    'automations.form.save': 'حفظ الأتمتة',
    'automations.form.invalidJson': 'يجب أن تكون الإجراءات/الشروط بصيغة JSON صحيحة.',
    'automations.form.testEventJson': 'بيانات حدث الاختبار (كائن JSON، اختياري)',
    'automations.form.createFirst': 'احفظ الأتمتة قبل الاختبار.',
`;
    s = s.replace("    'mod.automations': 'قواعد الأتمتة',", "    'mod.automations': 'قواعد الأتمتة'," + block);
  }
  fs.writeFileSync(p, s, 'utf8');
}
console.log('patched');

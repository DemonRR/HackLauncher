let activeParameterResolver = null;

const PARAMETER_LABELS = {
  TARGET: '目标地址',
  WORDLIST: '字典路径',
  PROXY: '代理地址',
  OUTPUT: '输出路径'
};

function automaticTemplateValues(item) {
  const now = new Date();
  return {
    TOOL_PATH: item.command || '',
    TOOL_DIR: typeof getWorkingDirectory === 'function' ? getWorkingDirectory(item.command || '') : '',
    DATE: now.toISOString().slice(0, 10),
    TIME: now.toTimeString().slice(0, 8).replaceAll(':', '-')
  };
}

function replaceTemplateVariables(value, variables) {
  return String(value || '').replace(/\$\{([A-Z][A-Z0-9_]*)\}/g, (match, name) =>
    Object.prototype.hasOwnProperty.call(variables, name) ? variables[name] : match
  );
}

function collectTemplateVariables(item) {
  const text = [item.command, item.launchParams, item.javaProgramParams].join('\n');
  const automatic = automaticTemplateValues(item);
  return [...new Set([...text.matchAll(/\$\{([A-Z][A-Z0-9_]*)\}/g)].map(match => match[1]))]
    .filter(name => !Object.prototype.hasOwnProperty.call(automatic, name));
}

function requestTemplateValues(item, names) {
  const modal = document.getElementById('parameter-prompt-modal');
  const fields = document.getElementById('parameter-prompt-fields');
  document.getElementById('parameter-prompt-description').textContent = `${item.name} 需要 ${names.length} 个本次运行参数`;
  fields.innerHTML = '';
  names.forEach(name => {
    const label = document.createElement('label');
    const title = document.createElement('span');
    title.textContent = PARAMETER_LABELS[name] || name;
    const input = document.createElement('input');
    input.name = name;
    input.required = true;
    input.autocomplete = 'off';
    input.placeholder = `请输入 \${${name}}`;
    input.value = localStorage.getItem(`hacklauncher.parameter.${name}`) || '';
    label.append(title, input);
    fields.appendChild(label);
  });
  modal.classList.remove('hidden');
  setTimeout(() => fields.querySelector('input')?.focus(), 50);
  return new Promise(resolve => { activeParameterResolver = resolve; });
}

function closeParameterPrompt(values = null) {
  document.getElementById('parameter-prompt-modal')?.classList.add('hidden');
  const resolve = activeParameterResolver;
  activeParameterResolver = null;
  if (resolve) resolve(values);
}

async function resolveItemTemplates(item) {
  const automatic = automaticTemplateValues(item);
  const names = collectTemplateVariables(item);
  let entered = {};
  if (names.length) {
    entered = await requestTemplateValues(item, names);
    if (!entered) return null;
  }
  const values = { ...automatic, ...entered };
  return {
    ...item,
    command: replaceTemplateVariables(item.command, values),
    launchParams: replaceTemplateVariables(item.launchParams, values),
    javaProgramParams: replaceTemplateVariables(item.javaProgramParams, values)
  };
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('parameter-prompt-form')?.addEventListener('submit', event => {
    event.preventDefault();
    const values = {};
    new FormData(event.currentTarget).forEach((value, key) => {
      values[key] = String(value).trim();
      localStorage.setItem(`hacklauncher.parameter.${key}`, values[key]);
    });
    closeParameterPrompt(values);
  });
  document.getElementById('parameter-prompt-close')?.addEventListener('click', () => closeParameterPrompt());
  document.getElementById('parameter-prompt-cancel')?.addEventListener('click', () => closeParameterPrompt());
  document.getElementById('parameter-prompt-modal')?.addEventListener('click', event => {
    if (event.target.id === 'parameter-prompt-modal') closeParameterPrompt();
  });
});

import React from 'react';
import path from 'path';
import fs from 'fs/promises';
import { ComponentPreview } from './component-preview';
import { CodeBlock } from './component-preview.codeblock';

const styles = [
  { name: 'default', label: 'Default' },
  { name: 'dark', label: 'Dark' },
];

interface DynamicComponentPreviewProps {
  name: string;
  styleName?: string;
}

const getComponentCode = React.cache(async (name: string, styleName: string): Promise<string> => {
  const registryPath = path.join(process.cwd(), 'registry', styleName, 'example', `${name}.tsx`);
  try {
    const code = await fs.readFile(registryPath, 'utf-8');
    return code.replace(`@/registry/${styleName}/`, '@/components/');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      console.error(`File not found: ${registryPath}`);
      return `// Component ${name} not found in ${styleName} style.`;
    }
    console.error(`Error reading file for ${name}:`, error);
    return `// Error loading component ${name}.`;
  }
});

export async function DynamicComponentPreview({ name, styleName = styles[0].name }: DynamicComponentPreviewProps) {
  const code = await getComponentCode(name, styleName);
  
  if (!code.trim()) {
    return <p>Component {name} not found in {styleName} style.</p>;
  }
  
  const highlightedCode = await CodeBlock({ code, lang: 'tsx' });
  
  return <ComponentPreview 
    name={name} 
    code={code} 
    styleName={styleName} 
    highlightedCode={highlightedCode}
  />;
}


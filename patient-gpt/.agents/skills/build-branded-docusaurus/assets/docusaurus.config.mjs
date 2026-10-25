import {themes as prismThemes} from 'prism-react-renderer';
import {createRequire} from 'node:module';

const require = createRequire(import.meta.url);

const config = {
  title: '__SITE_NAME__',
  tagline: 'Documentation that belongs to the product.',
  favicon: 'img/favicon.ico',
  url: process.env.SITE_URL ?? '__SITE_URL__',
  baseUrl: process.env.BASE_URL ?? '__BASE_URL__',
  trailingSlash: false,
  onBrokenLinks: 'throw',
  onBrokenMarkdownLinks: 'throw',
  organizationName: 'prometheus-ags',
  projectName: 'documentation',
  markdown: {mermaid: true},
  themes: ['@docusaurus/theme-mermaid'],
  presets: [['classic', {docs: {sidebarPath: './sidebars.js'}, blog: false, theme: {customCss: './src/css/custom.css'}}]],
  plugins: [[require.resolve('@easyops-cn/docusaurus-search-local'), {hashed: true, indexDocs: true}]],
  themeConfig: {
    colorMode: {defaultMode: 'dark', respectPrefersColorScheme: true},
    navbar: {title: '__SITE_NAME__', items: [{type: 'docSidebar', sidebarId: 'tutorialSidebar', label: 'Docs', position: 'left'}]},
    prism: {theme: prismThemes.github, darkTheme: prismThemes.dracula},
  },
};

export default config;

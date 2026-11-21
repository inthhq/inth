import type { CompleteTranslations } from '../types';

export const translations: CompleteTranslations = {
	common: {
		acceptAll: 'Aceitar todos',
		acknowledge: 'OK',
		close: 'Fechar',
		customize: 'Personalizar',
		dismiss: 'Fechar',
		rejectAll: 'Rejeitar todos',
		save: 'Salvar configurações',
		securedBy: 'Protegido por',
	},
	consentGate: {
		actionButton: 'Ativar consentimento {category}',
		error: 'This content could not be loaded.',
		loading: 'Loading content…',
		policyBlocked:
			"This content is unavailable under your region's consent policy.",
		title: 'Aceite {category} para ver este conteúdo',
	},
	consentManagerDialog: {
		description:
			'Personalize suas configurações de privacidade aqui. Você pode escolher quais tipos de cookies e tecnologias de rastreamento você permite.',
		title: 'Configurações',
		vendors: {
			disabledByCategory: 'Ative esta categoria para escolher fornecedores.',
			privacyPolicy: 'Política de privacidade',
			switchLabel: 'Permitir {vendor}',
			title: 'Fornecedores ({count})',
		},
	},
	consentTypes: {
		experience: {
			description:
				'Estes cookies nos ajudam a fornecer uma experiência de usuário melhor e testar novas funcionalidades.',
			title: 'Experiência',
		},
		functionality: {
			description:
				'Estes cookies permitem funcionalidades aprimoradas e personalização do site.',
			title: 'Funcionalidade',
		},
		marketing: {
			description:
				'Estes cookies são utilizados para fornecer publicidade relevante e rastrear a sua eficácia.',
			title: 'Marketing',
		},
		measurement: {
			description:
				'Estes cookies nos ajudam a compreender como os visitantes interagem com o site e melhoram o seu desempenho.',
			title: 'Análise',
		},
		necessary: {
			description:
				'Estes cookies são essenciais para o site funcionar corretamente e não podem ser desativados.',
			title: 'Estritamente necessário',
		},
	},
	cookieBanner: {
		description:
			'Este site utiliza cookies para melhorar a sua experiência de navegação, analisar o tráfego do site e mostrar conteúdos personalizados.',
		noticeDescription:
			'Utilizamos cookies e tecnologias semelhantes para o funcionamento deste site, medir o tráfego e personalizar conteúdos e anúncios. Pode optar por não participar ou gerir as suas preferências a qualquer momento.',
		noticeTitle: 'Aviso de privacidade',
		title: 'Respeitamos a sua privacidade',
	},
	iab: {
		app: {
			consentStorage:
				'As suas escolhas são armazenadas neste dispositivo, no armazenamento de definições padrão da aplicação com chaves IABTCF, durante um máximo de {days} dias. O período de armazenamento é renovado quando atualizar as suas escolhas.',
			description:
				'Nós e os nossos {partnerCount} parceiros armazenamos e/ou acedemos a informações num dispositivo e processamos dados pessoais, tais como identificadores únicos e informações de navegação, para esta aplicação, para:',
			legitimateInterestExplanation:
				'Alguns parceiros processam dados pessoais, tais como identificadores únicos e informações de navegação, com base no seu interesse legítimo em vez de pedirem o seu consentimento. Isto aplica-se apenas a esta aplicação. Tem o direito de se opor a este processamento para cada finalidade e cada parceiro.',
			scopeServiceSpecific:
				'O seu consentimento aplica-se apenas a esta aplicação e não afetará outros serviços.',
			withdraw:
				'Pode alterar as suas escolhas ou retirar o seu consentimento a qualquer momento nas Configurações de privacidade desta aplicação.',
		},
		banner: {
			andMore: 'E mais {count}...',
			description:
				'Nós e os nossos {partnerCount} parceiros armazenamos e/ou acedemos a informações num dispositivo e processamos dados pessoais, tais como identificadores únicos e informações de navegação, para este website, para:',
			legitimateInterestNotice:
				'Alguns parceiros alegam um interesse legítimo para processar os seus dados. Tem o direito de se opor a este processamento, personalizar as suas escolhas e retirar o seu consentimento a qualquer momento.',
			partnersLink: '{count} parceiros',
			scopeGroup:
				'A sua escolha aplica-se a todos os nossos sites neste grupo.',
			scopeServiceSpecific:
				'O seu consentimento aplica-se apenas a este site e não afetará outros serviços.',
			title: 'Configurações de privacidade',
		},
		common: {
			acceptAll: 'Aceitar todos',
			clearSelection: 'Limpar',
			customPartner: 'Parceiro personalizado não registado no IAB',
			customize: 'Personalizar',
			loading: 'A carregar...',
			rejectAll: 'Rejeitar todos',
			saveSettings: 'Salvar configurações',
			showingSelectedVendor: 'A mostrar o fornecedor selecionado',
		},
		preferenceCenter: {
			description:
				'Personalize suas configurações de privacidade aqui. Você pode escolher quais tipos de cookies e tecnologias de rastreamento você permite.',
			features: {
				description:
					'Esses meios de processamento podem ser usados exclusivamente para atingir uma ou mais finalidades, para as quais você tem a opção de escolher neste aviso.',
				title: 'Funcionalidades',
			},
			footer: {
				consentStorage:
					'As preferências de consentimento são armazenadas num cookie chamado "euconsent-v2" durante 13 meses. O período de armazenamento pode ser renovado quando atualizar as suas preferências.',
			},
			purposeItem: {
				examples: 'Exemplos',
				legitimateInterest: 'Interesse legítimo',
				objectButton: 'Opor-se',
				objected: 'Oposição registada',
				partners: '{count} parceiros',
				partnersUsingPurpose: 'Parceiros que utilizam esta finalidade',
				rightToObject:
					'Tem o direito de se opor ao processamento baseado no interesse legítimo.',
				vendorsUseLegitimateInterest:
					'{count} fornecedores alegam interesse legítimo',
				withYourPermission: 'Com a sua permissão',
			},
			specialPurposes: {
				title: 'Funções essenciais (obrigatórias)',
				tooltip:
					'Estas são necessárias para a funcionalidade e segurança do site. De acordo com o IAB TCF, não pode opor-se a estas finalidades especiais.',
			},
			tabs: {
				purposes: 'Finalidades',
				vendors: 'Fornecedores',
			},
			title: 'Configurações de privacidade',
			vendorList: {
				adTechProvidersHeading:
					'Fornecedores de tecnologia publicitária da Google',
				adTechProvidersNotice:
					'A Google trabalha com estes fornecedores de tecnologia publicitária fora do quadro do IAB. O seu consentimento só chega a um fornecedor se o ativar e permitir também o armazenamento de informações no seu dispositivo e a publicidade personalizada.',
				customVendorsHeading: 'Parceiros personalizados',
				customVendorsNotice:
					'Estes são parceiros personalizados não registados no IAB Transparency & Consent Framework (TCF). Processam dados com base no seu consentimento e podem ter práticas de privacidade diferentes das dos fornecedores registados no IAB.',
				dataCategories: 'Categorias de dados',
				features: 'Funcionalidades',
				iabVendorsHeading: 'Fornecedores registados no IAB',
				iabVendorsNotice:
					'Estes parceiros estão registados no IAB Transparency & Consent Framework (TCF), um padrão da indústria para gerir o consentimento',
				legitimateInterest: 'Int. legítimo',
				maxAge: 'Idade máx.: {days}d',
				nonCookieAccess: 'Acesso sem cookies',
				privacyPolicy: 'Política de privacidade',
				purposes: 'Finalidades',
				requiredNotice:
					'Necessário para a funcionalidade do site, não pode ser desativado',
				retention: 'Retenção: {days}d',
				search: 'Procurar fornecedores...',
				showingCount: '{filtered} de {total} fornecedores',
				specialFeatures: 'Funcionalidades especiais',
				specialPurposes: 'Finalidades especiais',
				storageDisclosure: 'Divulgação de armazenamento',
				usesCookies: 'Utiliza cookies',
			},
		},
	},
	legalLinks: {
		cookiePolicy: 'Política de Cookies',
		privacyPolicy: 'Política de Privacidade',
		termsOfService: 'Termos de Serviço',
	},
	optOut: {
		description:
			'Este site não venderá nem compartilhará suas informações pessoais, e sua escolha está salva neste navegador.',
		done: 'Concluído',
		lockedByAccount:
			'Sua conta optou por sair, e você pode alterar isso após fazer login.',
		lockedByGpc:
			'O sinal Global Privacy Control do seu navegador está ativado, portanto esta opção permanece desativada.',
		receiptAccount: 'Você optou por sair neste navegador e na sua conta.',
		receiptAccountWithRights:
			'Você optou por sair de {rights} neste navegador e na sua conta.',
		receiptBrowser: 'Você optou por sair neste navegador.',
		receiptBrowserWithRights:
			'Você optou por sair de {rights} neste navegador.',
		recordedLabel: 'Registrado',
		referenceLabel: 'Referência',
		rightsAll: 'venda, compartilhamento e publicidade direcionada',
		rightsSaleAndShare: 'venda e compartilhamento',
		rightsSaleAndTargetedAds: 'venda e publicidade direcionada',
		statusRequest: 'Solicitação de exclusão atendida',
		statusSignal: 'Sinal de preferência de exclusão atendido',
	},
	rights: {
		californiaPrivacyChoices: 'As suas escolhas de privacidade na Califórnia',
		optOut: 'Não vender nem partilhar os meus dados',
		preferences: 'Gerir preferências',
		privacyChoices: 'As suas escolhas de privacidade',
	},
};
export default translations;

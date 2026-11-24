import type { CompleteTranslations } from '../translations.model';

export const translations: CompleteTranslations = {
	common: {
		acceptAll: 'Aceitar todos',
		acknowledge: 'OK',
		close: 'Fechar',
		customize: 'Personalizar',
		dismiss: 'Fechar',
		rejectAll: 'Rejeitar todos',
		save: 'Salvar configurações',
		securedBy: 'Consentimento por',
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
		action: 'Recusar',
		description:
			'Este site não venderá nem compartilhará suas informações pessoais, e sua escolha está salva neste navegador.',
		done: 'Concluído',
		headingAll:
			'Venda e compartilhamento de suas informações pessoais e publicidade direcionada',
		headingSaleAndShare:
			'Venda e compartilhamento de suas informações pessoais',
		headingSaleAndTargetedAds:
			'Venda de suas informações pessoais e publicidade direcionada',
		lockedByAccount:
			'Sua conta optou por sair, e você pode alterar isso após fazer login.',
		lockedByGpc:
			'O sinal Global Privacy Control do seu navegador está ativado, portanto esta opção permanece desativada.',
		notOptedOut: 'Você não recusou neste navegador.',
		optInCancel: 'Manter exclusão',
		optInConfirm: 'Voltar a aceitar',
		optInDescription: 'Confirmar encerra sua exclusão neste navegador.',
		optInDescriptionWithRights:
			'Confirmar encerra sua exclusão de {rights} neste navegador.',
		optInLink: 'Voltar a aceitar…',
		optInTitle: 'Voltar a aceitar?',
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
	privacyChoices: {
		acceptAll: 'Aceitar todos',
		advertisingFollowsSale: 'A publicidade segue a sua escolha acima.',
		advertisingTitle: 'Publicidade',
		allow: 'Permitir',
		alwaysOn: 'Sempre ativo',
		announceSaved: '{message} Salvo.',
		askAll:
			'vender ou compartilhar suas informações pessoais, inclusive para publicidade direcionada',
		askSaleAndShare: 'vender ou compartilhar suas informações pessoais',
		askSaleAndTargetedAds:
			'vender suas informações pessoais ou usá-las para publicidade direcionada',
		bannerAllowedRightsOff:
			'Cookies opcionais permitidos. {rights} continuam sem permissão. Você pode alterar isso em As suas escolhas de privacidade.',
		bannerAllowedRightsOffGpc:
			'Cookies opcionais permitidos. {rights} continuam sem permissão por causa do seu sinal Global Privacy Control. Você pode alterar isso em As suas escolhas de privacidade.',
		bannerRejected:
			'Cookies opcionais rejeitados. Você pode alterar isso em As suas escolhas de privacidade.',
		barDescription:
			'Usamos cookies para melhorar a sua experiência e analisar o tráfego.',
		businessFallback: 'este site',
		choiceRecorded: 'Escolha registrada.',
		choicesSaved:
			'Escolhas salvas. Você pode alterá-las em As suas escolhas de privacidade.',
		choose: 'Escolher',
		chooseWhatToAllow: 'Escolher o que permitir',
		close: 'Fechar',
		confirmDescriptionOptIn:
			'{business} poderá {rights}. Você pode alterar isso a qualquer momento.',
		confirmDescriptionOptOut:
			'{business} poderá {rights}. Você pode recusar novamente a qualquer momento.',
		confirmKeepOptedOut: 'Manter a recusa',
		confirmTitleOptIn: 'Permitir {rights}?',
		confirmTitleOptOut: 'Permitir {rights} novamente?',
		copyFailed: 'Não foi possível copiar. Selecione e copie a sua referência:',
		copyFailedAnnouncement:
			'Não foi possível copiar. A referência completa aparece no comprovante.',
		copyReference: 'Copiar referência',
		dialogIntro: 'Suas escolhas valem imediatamente.',
		dialogTitle: 'As suas escolhas de privacidade',
		done: 'Concluído',
		dontAllow: 'Não permitir',
		euDialogIntro:
			'Escolha quais cookies opcionais {business} pode usar. Os cookies opcionais ficam desativados, a menos que você os ative.',
		euDialogTitle: 'Configurações de privacidade',
		gpcNote:
			'O seu navegador enviou um sinal Global Privacy Control, por isso {business} {rights} {scope}. A opção Permitir não fica disponível enquanto o sinal estiver ativo.',
		justNow: 'agora mesmo',
		nestedSheetNote:
			'As alterações valem quando você salvar em Configurações de privacidade.',
		noticeBarDescription:
			'Usamos cookies para o funcionamento deste site, medir o tráfego e personalizar anúncios. Você pode recusar a qualquer momento.',
		noticeBarDescriptionGpc:
			'Usamos cookies para o funcionamento deste site e para medir o tráfego. O seu sinal Global Privacy Control é respeitado.',
		noticeGpcHonored:
			'O sinal Global Privacy Control do seu navegador está sendo respeitado.',
		noticeRightsAction: 'Não vender nem partilhar os meus dados',
		nudge: 'Escolha primeiro um dos dois botões.',
		optInBarDescription:
			'{business} pede a sua permissão para usar cookies opcionais e para {rights}.',
		optInDescription:
			'Com a sua permissão, {business} usaria cookies opcionais para recursos do site e análise, e poderia {rights}. Nada é ativado sem que você permita.',
		optInTitle: 'As suas escolhas de privacidade',
		optOutOption: 'Recusar',
		panelExpanded: 'Mais opções exibidas.',
		policyColumn: 'Política de privacidade',
		preferencesClose: 'Fechar preferências',
		preferencesOnCount: 'Ativas: {count}',
		preferencesSheetIntro: 'As alterações valem imediatamente.',
		preferencesSummary: 'Recursos do site e análise',
		preferencesTitle: 'Preferências',
		purposeColumn: 'Finalidade',
		receiptAllowed: 'Permitido: {rights}',
		receiptDetails: 'Detalhes',
		receiptFromGpc: 'a partir do seu sinal Global Privacy Control',
		receiptLive: 'Respeitando o Global Privacy Control deste navegador',
		receiptLiveDetail: 'Lido do seu navegador a cada visita.',
		receiptOptedOut: 'Recusado: {rights}',
		receiptRecorded: 'Registrado: {date}',
		receiptReference: 'Referência',
		receiptSavedAccount: 'Salvo na sua conta · {date}',
		receiptSavedBrowser: 'Salvo para este navegador · {date}',
		receiptScopeAccount:
			'Vale para este navegador e para a sua conta {business}.',
		receiptScopeAccountUnnamed: 'Vale para este navegador e para a sua conta.',
		receiptScopeBrowser:
			'Vale para este navegador. Faça login para aplicar também à sua conta.',
		receiptViaGpc: 'Sinal Global Privacy Control',
		referenceCopied: 'Referência copiada.',
		refuseAll:
			'não venderá nem compartilhará suas informações pessoais, nem as usará para publicidade direcionada',
		refuseSaleAndShare:
			'não venderá nem compartilhará suas informações pessoais',
		refuseSaleAndTargetedAds:
			'não venderá suas informações pessoais nem as usará para publicidade direcionada',
		rejectAll: 'Rejeitar todos',
		rightsAllowed: '{rights}: permitido.',
		rightsNotAllowed: '{rights}: não permitido.',
		rightsOptedOut: 'Recusado: {rights}.',
		saleAllowed: '{business} pode {rights}.',
		saleGroupOptIn: 'Permitir {rights}',
		saleGroupSaleAndTargetedAds:
			'Recusar a venda dos meus dados pessoais e a publicidade direcionada',
		saleOffByDefault:
			'Desativado por padrão. {business} {rights}, a menos que você permita.',
		saleRefused: '{business} {rights} {scope}.',
		saveChoices: 'Salvar escolhas',
		saveInSettings: 'Salve suas escolhas em Configurações de privacidade',
		savedAutomatically: 'Salvo automaticamente',
		savedCue: 'Salvo',
		scopeAccount: 'neste navegador nem na sua conta {business}',
		scopeAccountUnnamed: 'neste navegador nem na sua conta',
		scopeBrowser: 'neste navegador',
		shortAll: 'vender ou compartilhar seus dados para publicidade',
		shortSaleAndShare: 'vender ou compartilhar seus dados',
		shortSaleAndTargetedAds: 'vender seus dados ou usá-los para publicidade',
		stateOff: 'Desativado',
		stateOn: 'Ativado',
		switchColumn: 'Ativado',
		switchedOff: '{name}: desativado.',
		switchedOn: '{name}: ativado.',
		titleAll: 'Venda, compartilhamento e publicidade direcionada',
		titleSaleAndShare: 'Venda e compartilhamento',
		titleSaleAndTargetedAds: 'Venda e publicidade direcionada',
		vendorColumn: 'Fornecedor',
		vendorPolicy: 'Política de privacidade de {vendor}',
		vendorsClose: 'Fechar fornecedores de {category}',
		vendorsFor: 'de {category}',
		vendorsHide: 'Ocultar {count} fornecedores',
		vendorsHideOne: 'Ocultar 1 fornecedor',
		vendorsOnCount: 'Ativos: {count}',
		vendorsTable: 'Fornecedores de {category}',
		vendorsView: 'Ver {count} fornecedores',
		vendorsViewOne: 'Ver 1 fornecedor',
	},
	rights: {
		californiaPrivacyChoices: 'As suas escolhas de privacidade na Califórnia',
		optOut: 'Não vender nem partilhar os meus dados',
		preferences: 'Gerir preferências',
		privacyChoices: 'As suas escolhas de privacidade',
	},
};
export default translations;

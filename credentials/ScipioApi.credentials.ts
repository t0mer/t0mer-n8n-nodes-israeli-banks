import type { IAuthenticateGeneric, ICredentialTestRequest, ICredentialType, INodeProperties } from 'n8n-workflow';

export class ScipioApi implements ICredentialType {
	name = 'scipioApi';

	displayName = 'Scipio API';

	icon = {
		light: 'file:../nodes/IsraeliBank/israeliBank.svg',
		dark: 'file:../nodes/IsraeliBank/israeliBank.dark.svg',
	} as const;

	documentationUrl = 'https://github.com/t0mer/n8n-nodes-israeli-banks#credentials';

	properties: INodeProperties[] = [
		{
			displayName: 'Base URL',
			name: 'baseUrl',
			type: 'string',
			default: '',
			required: true,
			placeholder: 'e.g. http://scipio:8080',
			description: 'Root URL of your Scipio server, without /api/v1',
		},
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			description: 'One of the tokens in Scipio\'s API_TOKENS. Leave empty if Scipio runs without tokens.',
		},
		{
			displayName: 'Ignore SSL Issues (Insecure)',
			name: 'ignoreSslIssues',
			type: 'boolean',
			default: false,
			description: 'Whether to connect even if the SSL certificate is invalid (e.g. self-signed)',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				Authorization: '={{$credentials.apiKey ? "Bearer " + $credentials.apiKey : ""}}',
			},
		},
	};

	test: ICredentialTestRequest = {
		request: {
			baseURL: '={{$credentials.baseUrl.replace(/\\/+$/, "")}}',
			url: '/api/v1/companies',
			skipSslCertificateValidation: '={{$credentials.ignoreSslIssues}}',
		},
	};
}

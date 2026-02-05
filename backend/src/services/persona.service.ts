import crypto from 'crypto';

export interface PersonaInquiryResult {
  status: string;
  fields: Record<string, unknown>;
}

export class PersonaService {
  private apiKey: string;
  private templateId: string;
  private webhookSecret: string;
  private baseUrl = 'https://withpersona.com/api/v1';
  private mockMode: boolean;

  constructor() {
    this.mockMode = process.env.PERSONA_MOCK === 'true';
    this.apiKey = process.env.PERSONA_API_KEY || '';
    this.templateId = process.env.PERSONA_TEMPLATE_ID || '';
    this.webhookSecret = process.env.PERSONA_WEBHOOK_SECRET || '';
  }

  async createInquiry(nationalId: string, referenceId: string): Promise<{ inquiryId: string; url: string }> {
    if (this.mockMode) {
      return {
        inquiryId: `inq_mock_${referenceId}`,
        url: 'http://localhost:3000/mock-persona',
      };
    }

    const response = await fetch(`${this.baseUrl}/inquiries`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        'Persona-Version': '2023-01-05',
        'Key-Inflection': 'camel',
      },
      body: JSON.stringify({
        data: {
          attributes: {
            inquiryTemplateId: this.templateId,
            referenceId,
            fields: {
              nationalId,
            },
          },
        },
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Persona API error (${response.status}): ${body}`);
    }

    const result = await response.json() as {
      data: { id: string; attributes: { referenceId: string } };
      meta: { sessionToken: string };
    };

    const inquiryId = result.data.id;
    const sessionToken = result.meta.sessionToken;
    const url = `https://withpersona.com/verify?inquiry-id=${inquiryId}&session-token=${sessionToken}`;

    return { inquiryId, url };
  }

  async getInquiry(inquiryId: string): Promise<PersonaInquiryResult> {
    if (this.mockMode) {
      return { status: 'completed', fields: {} };
    }

    const response = await fetch(`${this.baseUrl}/inquiries/${inquiryId}`, {
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Persona-Version': '2023-01-05',
        'Key-Inflection': 'camel',
      },
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Persona API error (${response.status}): ${body}`);
    }

    const result = await response.json() as {
      data: { attributes: { status: string; fields: Record<string, unknown> } };
    };

    return {
      status: result.data.attributes.status,
      fields: result.data.attributes.fields || {},
    };
  }

  verifyWebhookSignature(payload: string, signature: string): boolean {
    if (this.mockMode) return true;

    if (!this.webhookSecret) return false;

    const expected = crypto
      .createHmac('sha256', this.webhookSecret)
      .update(payload)
      .digest('hex');

    return crypto.timingSafeEqual(
      Buffer.from(signature, 'hex'),
      Buffer.from(expected, 'hex'),
    );
  }

  isMockMode(): boolean {
    return this.mockMode;
  }
}

export const personaService = new PersonaService();


import { GoogleGenAI, Type } from "@google/genai";
import { PerDcompOrder } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });

export const extractPerDcompFromXml = async (xmlContent: string): Promise<Partial<PerDcompOrder>> => {
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: `Analise o seguinte conteúdo de um arquivo XML de PER/DCOMP e extraia as informações estruturadas.
    Conteúdo XML:
    ${xmlContent.substring(0, 15000)} // Limiting to prevent token overflow for huge files
    `,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          perDcompNumber: { type: Type.STRING, description: "O número do PER/DCOMP" },
          transmissionDate: { type: Type.STRING, description: "Data de transmissão no formato YYYY-MM-DD" },
          creditType: { type: Type.STRING, description: "Tipo de crédito (ex: IPI, PIS, COFINS)" },
          documentType: { type: Type.STRING, description: "Tipo de documento (ex: Pedido de Ressarcimento)" },
          status: { 
            type: Type.STRING, 
            description: "Situação atual",
            enum: ['Em Processamento', 'Deferido', 'Indeferido', 'Cancelado', 'Retificado']
          },
          value: { type: Type.NUMBER, description: "Valor total do crédito em formato numérico" }
        },
        required: ["perDcompNumber", "transmissionDate", "value"]
      }
    }
  });

  try {
    return JSON.parse(response.text || '{}');
  } catch (e) {
    console.error("Erro ao processar resposta do Gemini", e);
    throw new Error("Não foi possível extrair os dados do XML de forma estruturada.");
  }
};

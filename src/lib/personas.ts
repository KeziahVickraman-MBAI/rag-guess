import type { Block, PersonId } from "./types";

export interface Persona {
  id: PersonId;
  name: string;
  lens: Block[];
  lensDescription: string;
  retrievalQuery: string;
}

export const PERSONAS: Persona[] = [
  {
    id: 1,
    name: "Customer Sleuth",
    lens: ["customer_segments", "customer_relationships", "channels"],
    lensDescription: "who the customers are, how the startup reaches them, and how it keeps them",
    retrievalQuery: "Who are the target customers, where are they, and how do they use or receive the product?",
  },
  {
    id: 2,
    name: "Value Hunter",
    lens: ["value_propositions", "key_activities"],
    lensDescription: "what value is delivered and what the startup actually does every day",
    retrievalQuery: "What problem does the product solve, what does it do, and what benefit do users get?",
  },
  {
    id: 3,
    name: "Money Tracker",
    lens: ["revenue_streams", "cost_structure"],
    lensDescription: "how the startup makes money and what it spends money on",
    retrievalQuery: "How does the business charge customers, what are the prices, and what are the main costs?",
  },
  {
    id: 4,
    name: "Tech Analyst",
    lens: ["key_partners", "key_resources"],
    lensDescription: "the partners, data sources, technology and assets the startup relies on",
    retrievalQuery: "What technology, data sources, APIs, partners and platforms does the product rely on?",
  },
];

export const personaById = (id: PersonId): Persona => PERSONAS[id - 1];

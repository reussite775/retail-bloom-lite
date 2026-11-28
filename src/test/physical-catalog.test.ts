import { describe, expect, it } from 'vitest';
import { attributeObject, optionalPrice, referenceConflict, movementInput } from '@/lib/physical-catalog';

describe('Références du catalogue physique', () => {
  const rows = [{ id: 'p', sku: 'SKU-001', barcode: '0012345' }, { id: 'v', sku: 'ROUGE-M', barcode: '9988' }];
  it('refuse une référence existante sans tenir compte de la casse', () => expect(referenceConflict(' sku-001 ', '', rows)).toBe(true));
  it('refuse un code-barres utilisé par une variante', () => expect(referenceConflict('NEW', '9988', rows)).toBe(true));
  it('conserve les zéros initiaux des codes-barres', () => expect(referenceConflict('NEW', '12345', rows)).toBe(false));
  it('permet de conserver sa propre référence pendant une modification', () => expect(referenceConflict('SKU-001', '0012345', rows, 'p')).toBe(false));
  it('ne considère pas les codes-barres vides comme des doublons', () => expect(referenceConflict('', '', rows)).toBe(false));
});
describe('Variantes', () => {
  it('hérite du prix du produit si aucun prix spécifique', () => expect(optionalPrice('')).toBeNull());
  it('accepte un prix spécifique nul', () => expect(optionalPrice('0')).toBe(0));
  it('refuse les prix négatifs et non numériques', () => { expect(() => optionalPrice('-1')).toThrow(); expect(() => optionalPrice('xx')).toThrow(); });
  it('enregistre des attributs personnalisés', () => expect(attributeObject([{ key:'Taille', value:'M' },{ key:'Contenance', value:'500 ml' }])).toEqual({ Taille:'M', Contenance:'500 ml' }));
  it('refuse les attributs incomplets et doublons', () => { expect(() => attributeObject([{ key:'Taille',value:'' }])).toThrow(); expect(() => attributeObject([{ key:'Taille',value:'M' },{ key:'taille',value:'L' }])).toThrow(); });
});
describe('Mouvements de stock', () => {
  it.each(['in','out','loss','damage'])('%s exige une quantité entière strictement positive', (kind) => { expect(movementInput(kind,'3','Livraison',false,'').quantity).toBe(3); expect(() => movementInput(kind,'0','Motif',false,'')).toThrow(); expect(() => movementInput(kind,'1.5','Motif',false,'')).toThrow(); });
  it('autorise un ajustement à zéro', () => expect(movementInput('adjustment','0','Comptage',false,'').quantity).toBe(0));
  it('exige un motif', () => expect(() => movementInput('in','1',' ',false,'')).toThrow());
  it('exige la variante pour un produit décliné', () => { expect(() => movementInput('in','1','Livraison',true,'')).toThrow(); expect(movementInput('in','1','Livraison',true,'v').quantity).toBe(1); });
});
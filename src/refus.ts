// Refus d'une action : levé par les actions de jeu (tapis et board joueur), renvoyé au seul émetteur en « nack ».
export class Refus extends Error {}
export const refuser = (raison: string): never => { throw new Refus(raison); };

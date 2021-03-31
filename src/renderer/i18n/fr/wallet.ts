import { WalletMessages } from '../types'

const wallet: WalletMessages = {
  'wallet.nav.deposits': 'Dépots',
  'wallet.nav.bonds': 'Cautions',
  'wallet.nav.poolshares': 'Parts',
  'wallet.column.name': 'Nom',
  'wallet.column.ticker': 'Ticker',
  'wallet.column.balance': 'Solde',
  'wallet.action.send': 'Envoyer',
  'wallet.action.upgrade': 'Mise à jour',
  'wallet.action.receive': 'Recevoir du {asset}',
  'wallet.action.remove': 'Supprimer le portefeuille',
  'wallet.action.unlock': 'Déverrouiller',
  'wallet.action.connect': 'Connecter',
  'wallet.action.import': 'Importer',
  'wallet.action.create': 'Créer',
  'wallet.action.deposit': 'Déposer',
  'wallet.connect.instruction': 'Veuillez connecter votre portefeuille',
  'wallet.unlock.title': 'Déverrouiller votre portefeuille',
  'wallet.unlock.instruction': 'Veuillez déverrouiller votre portefeuille',
  'wallet.unlock.phrase': 'Entrez votre phrase de récupération',
  'wallet.unlock.error':
    'Impossible de déverrouiller le portefeuille. Veuillez vérifier votre mot de passe et réessayez',
  'wallet.imports.keystore.select': 'Sélectionner le fichier keystore',
  'wallet.imports.keystore.upload': 'Choisir le fichier à uploader',
  'wallet.imports.phrase': 'Phrase',
  'wallet.imports.wallet': 'Importer un portefeuille existant',
  'wallet.imports.enterphrase': 'Entrez la phrase de récupération',
  'wallet.imports.error.instance': 'Impossible de créer une instance du Client',
  'wallet.imports.error.keystore.load': 'Clé privée incorrecte',
  'wallet.imports.error.keystore.import': 'Mot de passe incorrect',
  'wallet.phrase.error.valueRequired': 'La phrase de récupération est requise',
  'wallet.phrase.error.invalid': 'Phrase de récupération incorrecte',
  'wallet.phrase.error.import': "Erreur lors de l'importation de la phrase de récupération",
  'wallet.txs.last90days': 'Transactions des 90 derniers jours',
  'wallet.empty.phrase.import': 'Importez un portefeuille existant contenant des fonds',
  'wallet.empty.phrase.create': "Créez un nouveau portefeuille, et l'alimenter en fonds",
  'wallet.create.copy.phrase': 'Copiez la phrase ci-dessous',
  'wallet.create.title': 'Créer un nouveau portefeuille',
  'wallet.create.enter.phrase': 'Entrez la phrase correctement',
  'wallet.create.words.click': 'Cliquez sur le mot dans le bon ordre',
  'wallet.create.creating': 'Création du portefeuille',
  'wallet.create.error': "Erreur lors de la sauvegarde d'une phrase",
  'wallet.receive.address.error': 'Aucune adresse disponible pour recevoir des fonds',
  'wallet.receive.address.errorQR': "Erreur lors de l'affichage du QR code : {error}",
  'wallet.send.success': 'Transaction réussie.',
  'wallet.send.error': 'Erreur de transaction.',
  'wallet.send.fastest': 'Très rapide',
  'wallet.send.fast': 'Rapide',
  'wallet.send.average': 'Normal',
  'wallet.errors.balancesFailed': 'Échec lors du chargement des soldes. {errorMsg} (API Id: {apiId})',
  'wallet.errors.asset.notExist': 'Aucun {asset}',
  'wallet.errors.address.empty': "L'adresse ne peut être vide",
  'wallet.errors.address.invalid': "L'adresse est incorrecte",
  'wallet.errors.address.couldNotFind': "Impossible de trouver l'adresse de la pool {pool}",
  'wallet.errors.amount.shouldBeNumber': 'Le montant doit être un nombre',
  'wallet.errors.amount.shouldBeGreaterThan': 'Le montant doit être supérieur à {amount}',
  'wallet.errors.amount.shouldBeLessThanBalance': 'Le montant doit être inférieur à votre solde',
  'wallet.errors.amount.shouldBeLessThanBalanceAndFee': 'Le montant doit être inférieur à votre solde moins les frais',
  'wallet.errors.fee.notCovered': 'Les frais ne sont pas couverts par votre solde de ({balance})',
  'wallet.errors.invalidChain': 'Chaîne non valide : {chain}',
  'wallet.password.confirmation': 'Confirmation du mot de passe',
  'wallet.password.confirmation.pending': 'Validation du mot de passe',
  'wallet.password.confirmation.error': 'Le mot de passe est erroné',
  'wallet.password.repeat': 'Répétez le mot de passe',
  'wallet.password.mismatch': 'Non-concordance des mots de passe',
  'wallet.upgrade.pending': 'Mise à jour',
  'wallet.upgrade.success': 'Mise à jour réussie',
  'wallet.upgrade.error': 'Échec de la mise à jour',
  'wallet.upgrade.error.loadPoolAddress': 'l’adresse de la pool {pool} n’a pas pu être chargée',
  'wallet.upgrade.feeError': 'Les frais supplémentaires {fee} ne sont pas couverts par votre solde {balance}',
  'wallet.validations.lessThen': 'Devrait être inférieur à {value}',
  'wallet.validations.graterThen': 'Devrait être supérieur à {value}',
  'wallet.validations.shouldNotBeEmpty': 'Ne devrait pas être vide'
}

export default wallet

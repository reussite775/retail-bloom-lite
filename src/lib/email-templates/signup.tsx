import * as React from 'react'

import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Link,
  Preview,
  Text,
} from '@react-email/components'

interface SignupEmailProps {
  siteName: string
  siteUrl: string
  recipient: string
  confirmationUrl: string
  token?: string
}

export const SignupEmail = ({
  siteName,
  siteUrl,
  recipient,
  confirmationUrl,
  token,
}: SignupEmailProps) => (
  <Html lang="fr" dir="ltr">
    <Head>
      <style>{darkModeCss}</style>
    </Head>
    <Preview>Votre code de confirmation {siteName}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>Bienvenue dans {siteName} !</Heading>
        <Text style={text}>
          Merci de votre inscription à{' '}
          <Link href={siteUrl} style={link}>
            <strong>{siteName}</strong>
          </Link>
          !
        </Text>
        <Text style={text}>
          Pour confirmer votre adresse e-mail (
          <Link href={`mailto:${recipient}`} style={link}>
            {recipient}
          </Link>
          ), saisissez ce code dans GestiPro :
        </Text>
        {token ? (
          <Text style={codeStyle}>{token}</Text>
        ) : (
          <Button className="dm-btn" style={button} href={confirmationUrl}>
            Confirmer mon adresse e-mail
          </Button>
        )}
        <Text style={text}>Ce code est personnel. Ne le communiquez à personne. S’il a expiré, demandez un nouveau code depuis GestiPro.</Text>
        <Text style={footer}>
          Si vous n’avez pas créé de compte GestiPro, ignorez cet e-mail.
        </Text>
      </Container>
    </Body>
  </Html>
)

export default SignupEmail

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif' }
const container = { padding: '20px 25px' }
const h1 = {
  fontSize: '22px',
  fontWeight: 'bold' as const,
  color: '#000000',
  margin: '0 0 20px',
}
const text = {
  fontSize: '14px',
  color: '#55575d',
  lineHeight: '1.5',
  margin: '0 0 25px',
}
const link = { color: 'inherit', textDecoration: 'underline' }
const codeStyle = {
  fontFamily: 'Arial, sans-serif',
  fontSize: '32px',
  fontWeight: 'bold' as const,
  color: '#2e9e5b',
  backgroundColor: '#edf7f0',
  borderRadius: '8px',
  padding: '20px',
  textAlign: 'center' as const,
  margin: '0 0 25px',
}
const button = {
  backgroundColor: '#2e9e5b',
  color: '#ffffff',
  fontSize: '14px',
  border: '1px solid #2e9e5b',
  borderRadius: '8px',
  padding: '12px 20px',
  textDecoration: 'none',
}
const footer = { fontSize: '12px', color: '#999999', margin: '30px 0 0' }
// Rendered as a text child, which React may HTML-escape: keep this CSS free of >, &, and quotes.
const darkModeCss = `
  @media (prefers-color-scheme: dark) {
    .dm-btn { background-color: #ffffff !important; color: #000000 !important; }
  }
  [data-ogsc] .dm-btn { background-color: #ffffff !important; color: #000000 !important; }
  [data-ogsb] .dm-btn { background-color: #ffffff !important; color: #000000 !important; }
`

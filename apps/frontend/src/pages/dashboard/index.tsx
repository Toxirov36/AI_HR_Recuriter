import { Link } from 'react-router-dom';
import {
  ArrowUpRight,
  BriefcaseBusiness,
  Users,
  GitBranch,
  Sparkles,
  ArrowRight,
  FileCheck2,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../features/auth';
import {
  Alert,
  Avatar,
  AvatarFallback,
  Badge,
  Button,
  Empty,
  Loading,
  PageTitle,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  useData,
  getStageLabel,
} from '../../components/ui';
import { stages } from '../../types';
import type { DashboardData } from '../../types';

/** The pipeline chart shows the stages a candidate moves through; rejections are not part of it. */
const chartStages = stages.filter((stage) => stage !== 'REJECTED');

export function Dashboard() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { data, error, reload } = useData<DashboardData>('/dashboard');

  const firstName = user?.fullName ? user.fullName.split(' ')[0].toUpperCase() : '';
  const greeting = firstName ? t('dashboard.greeting', { name: firstName }) : t('dashboard.greetingFallback');

  return (
    <>
      <PageTitle
        eyebrow={greeting}
        title={t('dashboard.overviewTitle')}
        text={t('dashboard.overviewSubtitle')}
      />
      <Alert message={error} />
      {error && (
        <Button variant="outline" className="mt-3" onClick={reload}>
          {t('common.tryAgain')}
        </Button>
      )}
      {!data && !error ? (
        <Loading />
      ) : (
        data && (
          <>
            <div className="bento">
              {[
                {
                  title: t('dashboard.activeVacancies'),
                  value: data.vacancies,
                  icon: BriefcaseBusiness,
                  text: t('dashboard.opportunitiesOpen'),
                  to: '/vacancies?status=ACTIVE',
                },
                {
                  title: t('dashboard.draftVacancies'),
                  value: data.draftVacancies,
                  icon: BriefcaseBusiness,
                  text: t('dashboard.reviewDrafts'),
                  to: '/vacancies?status=DRAFT',
                },
                {
                  title: t('dashboard.newApplications'),
                  value: data.newApplications,
                  icon: GitBranch,
                  text: t('dashboard.reviewNew'),
                  to: '/pipeline?stage=NEW',
                },
                {
                  title: t('dashboard.yourCandidates'),
                  value: data.candidates,
                  icon: Users,
                  text: t('dashboard.talentPool'),
                  to: '/candidates',
                },
                {
                  title: t('dashboard.applications'),
                  value: data.applications,
                  icon: GitBranch,
                  text: t('dashboard.acrossPipeline'),
                  to: '/pipeline',
                },
                {
                  title: t('dashboard.hired'),
                  value: data.stages.find((stage) => stage.status === 'HIRED')?._count || 0,
                  icon: FileCheck2,
                  text: t('dashboard.confirmedByTeam'),
                  to: '/pipeline?stage=HIRED',
                },
              ]
                .sort((a, b) => Number(b.to === '/pipeline') - Number(a.to === '/pipeline'))
                .map((s) => (
                  <Link
                    to={s.to}
                    className={`stat${s.to === '/pipeline' ? ' stat-hero' : ''}`}
                    key={s.title}
                  >
                    <div>
                      <span className="stat-icon">
                        <s.icon size={16} aria-hidden="true" />
                      </span>
                      <span className="stat-title">{s.title}</span>
                      {s.to === '/pipeline?stage=NEW' && s.value > 0 && (
                        <span className="pill-up">+{s.value}</span>
                      )}
                    </div>
                    <strong>{s.value.toString().padStart(2, '0')}</strong>
                    <footer>
                      {s.text}
                      <ArrowUpRight size={16} />
                    </footer>
                  </Link>
                ))}

              <section className="panel span-8">
                <div className="panel-heading">
                  <div>
                    <h2>{t('dashboard.pipelineHeading')}</h2>
                    <p>{t('dashboard.pipelineSubheading')}</p>
                  </div>
                  <Link to="/pipeline" className="text-link">
                    {t('dashboard.viewPipeline')} <ArrowRight size={15} />
                  </Link>
                </div>
                <div className="pipeline-chart">
                  {chartStages.map((stage) => {
                    const count = data.stages.find((s) => s.status === stage)?._count || 0;
                    return (
                      <div className="chart-column" key={stage}>
                        <strong>{count}</strong>
                        <div className="bar-track">
                          <div
                            className={`bar ${stage.toLowerCase()}`}
                            style={{
                              height: `${count ? Math.max(12, (count / Math.max(1, ...data.stages.filter((s) => s.status !== 'REJECTED').map((s) => s._count))) * 100) : 3}%`,
                            }}
                          />
                        </div>
                        <span>{getStageLabel(stage, t)}</span>
                      </div>
                    );
                  })}
                </div>
                <div className="panel-foot">
                  <span className="live-dot" /> {t('dashboard.pipelineLiveFoot')}
                </div>
              </section>
              <section className="panel span-4 quick-actions-panel">
                <div className="panel-heading">
                  <div>
                    <h2>{t('dashboard.quickActions')}</h2>
                    <p>{t('dashboard.quickActionsSubtitle')}</p>
                  </div>
                </div>
                <div className="quick-actions-list">
                  {[
                    {
                      to: '/vacancies?new=1',
                      icon: Sparkles,
                      title: t('dashboard.draftJob'),
                      text: t('dashboard.draftJobSub'),
                    },
                    {
                      to: '/candidates',
                      icon: Users,
                      title: t('dashboard.reviewCandidates'),
                      text: t('dashboard.reviewCandidatesSub'),
                    },
                    {
                      to: '/pipeline',
                      icon: GitBranch,
                      title: t('dashboard.openPipeline'),
                      text: t('dashboard.openPipelineSub'),
                    },
                  ].map((action) => (
                    <Link key={action.title} to={action.to}>
                      <span>
                        <action.icon size={17} />
                      </span>
                      <div>
                        <strong>{action.title}</strong>
                        <small>{action.text}</small>
                      </div>
                      <ArrowRight size={15} />
                    </Link>
                  ))}
                </div>
              </section>

              <section className="panel span-12">
              <div className="panel-heading">
                <div>
                  <h2>{t('dashboard.recentApplications')}</h2>
                  <p>{t('dashboard.recentApplicationsSubtitle')}</p>
                </div>
                <Link className="text-link" to="/pipeline">
                  {t('common.viewAll')} <ArrowRight size={15} />
                </Link>
              </div>
              {data.recent.length ? (
                <div className="table-wrap">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t('dashboard.tableCandidate')}</TableHead>
                        <TableHead>{t('dashboard.tableVacancy')}</TableHead>
                        <TableHead>{t('dashboard.tableStage')}</TableHead>
                        <TableHead className="w-[50px]" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.recent.map((a) => (
                        <TableRow key={a.id}>
                          <TableCell>
                            <Link
                              className="person inline-flex items-center gap-2.5 font-medium"
                              to={`/applications/${a.id}`}
                            >
                              <Avatar className="h-7 w-7 text-xs">
                                <AvatarFallback className="bg-[#1b4338] text-white font-semibold text-[11px]">
                                  {a.candidate.fullName.slice(0, 2).toUpperCase()}
                                </AvatarFallback>
                              </Avatar>
                              {a.candidate.fullName}
                            </Link>
                          </TableCell>
                          <TableCell>{a.vacancy.title}</TableCell>
                          <TableCell>
                            <Badge value={a.status} />
                          </TableCell>
                          <TableCell className="text-right">
                            <Link
                              className="inline-flex items-center justify-center p-1.5 rounded hover:bg-muted"
                              aria-label={`Review ${a.candidate.fullName}`}
                              to={`/applications/${a.id}`}
                            >
                              <ArrowUpRight size={17} />
                            </Link>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <Empty
                  title={t('dashboard.emptyTitle')}
                  text={t('dashboard.emptySubtitle')}
                >
                  <Link className="secondary" to="/candidates">
                    {t('dashboard.addFirstCandidate')} <ArrowRight size={16} />
                  </Link>
                </Empty>
              )}
            </section>
            </div>
          </>
        )
      )}
    </>
  );
}

<?php
/**
 * License Manager Pro — site licenses view (logged-in user's keys).
 */

declare(strict_types=1);

namespace Licensemanagerpro\Component\Licensemanagerpro\Site\View\Licenses;

use Joomla\CMS\Language\Text;
use Joomla\CMS\MVC\View\HtmlView as BaseHtmlView;
use Licensemanagerpro\Component\Licensemanagerpro\Site\Model\LicensesModel;
use Throwable;

class HtmlView extends BaseHtmlView
{
    /** @var array<int, array> */
    public array $licenses = [];
    public ?string $licenseError = null;

    public function display($tpl = null): void
    {
        /** @var LicensesModel $model */
        $model = $this->getModel();
        try {
            $this->licenses = $model->getLicenses();
        } catch (Throwable $e) {
            $this->licenseError = $e->getMessage();
        }
        $this->document->setTitle(Text::_('COM_LICENSMANAGERPRO_MY_LICENSES'));
        parent::display($tpl);
    }
}
